// ffmpeg.wasm engine (spec §5): self-hosted core, lazy-loaded with download progress, WORKERFS input mounts,
// real progress from FFmpeg's processed time, cancellation by terminating and reloading the engine.
import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { MediaError, toMediaError } from '@/lib/media/errors';
import { detectFeatures } from '@/lib/media/features';
import type { FfmpegPlan } from './args';
import { parseFfmpegProbe, parseProgressTime } from './probe-parse';
import type { VideoProbe, VideoProgress } from './types';

type ProgressFn = (p: VideoProgress) => void;

interface CoreUrls {
  coreURL: string;
  wasmURL: string;
  workerURL?: string;
  multithreaded: boolean;
}

const BASE = `${import.meta.env.BASE_URL}ffmpeg`;
/** Approximate wasm size, used for progress when the server sends no Content-Length. */
const APPROX_WASM_BYTES = 32_500_000;
const MT_LOAD_TIMEOUT_MS = 30_000;
const ST_LOAD_TIMEOUT_MS = 60_000;
const DEFAULT_JOB_TIMEOUT_MS = 30 * 60_000;
const INPUT_DIR = '/input';
const WORK_DIR = '/work';

async function fetchToBlobUrl(url: string, mime: string, onBytes?: (loaded: number, total: number) => void): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new MediaError('NETWORK_ERROR', undefined, { cause: error });
  }
  if (!response.ok || !response.body) throw new MediaError('ENGINE_LOAD_FAILED');
  const total = Number(response.headers.get('content-length')) || APPROX_WASM_BYTES;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes?.(loaded, Math.max(total, loaded));
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: mime }));
}

function classifyFailure(log: string[]): MediaError {
  const text = log.join('\n');
  if (/Invalid data found when processing input|moov atom not found|EBML header parsing failed|could not find codec parameters/i.test(text)) {
    return new MediaError('CORRUPTED_FILE');
  }
  if (/Decoder \(codec [^)]+\) not found|Unknown decoder|Unknown encoder|Encoder not found|not currently supported in container|Could not find tag for codec/i.test(text)) {
    return new MediaError('CODEC_UNAVAILABLE');
  }
  if (/Cannot allocate memory|out of memory|OOM/i.test(text)) return new MediaError('OUT_OF_MEMORY');
  if (/does not contain any stream|Output file #0 does not contain any stream|matches no streams/i.test(text)) {
    return new MediaError('ENCODER_FAILED', 'The file has no streams that can be used for this operation.');
  }
  return new MediaError('ENCODER_FAILED');
}

export interface FfmpegRunResult {
  data: Uint8Array;
  outputProbe: VideoProbe | null;
}

class FfmpegEngine {
  private ffmpeg: FFmpeg | null = null;
  private loading: Promise<FFmpeg> | null = null;
  private urls: { mt?: CoreUrls; st?: CoreUrls } = {};
  private lock: Promise<unknown> = Promise.resolve();
  private logLines: string[] = [];
  private onLog: ((line: string) => void) | null = null;
  /** Set when the multithreaded core failed, so later loads go straight to the single-threaded core. */
  private mtBroken = false;
  /** Set when a job crashed on the multithreaded core; the job is retried once single-threaded. */
  private crashedOnMt = false;
  multithreaded = false;
  /**
   * Bumped by terminate(). Work started under an older generation stops at its next step, and a load that
   * completes after a terminate is discarded, so a cancelled job can never keep using a fresh engine.
   */
  private generation = 0;

  get loaded(): boolean {
    return this.ffmpeg?.loaded ?? false;
  }

  private async coreUrls(multithreaded: boolean, onProgress?: ProgressFn): Promise<CoreUrls> {
    const cached = multithreaded ? this.urls.mt : this.urls.st;
    if (cached) return cached;
    const dir = `${BASE}/${multithreaded ? 'mt' : 'st'}`;
    const report = (loaded: number, total: number) =>
      onProgress?.({ stage: 'loading-engine', fraction: Math.min(0.99, loaded / total), message: 'Downloading video engine (one time, ~32 MB)' });
    const [coreURL, wasmURL, workerURL] = await Promise.all([
      fetchToBlobUrl(`${dir}/ffmpeg-core.js`, 'text/javascript'),
      fetchToBlobUrl(`${dir}/ffmpeg-core.wasm`, 'application/wasm', report),
      multithreaded ? fetchToBlobUrl(`${dir}/ffmpeg-core.worker.js`, 'text/javascript') : Promise.resolve(undefined),
    ]);
    const urls: CoreUrls = { coreURL, wasmURL, workerURL, multithreaded };
    if (multithreaded) this.urls.mt = urls;
    else this.urls.st = urls;
    return urls;
  }

  private attach(ffmpeg: FFmpeg) {
    ffmpeg.on('log', ({ message }) => {
      this.logLines.push(message);
      if (this.logLines.length > 400) this.logLines.splice(0, this.logLines.length - 400);
      this.onLog?.(message);
    });
  }

  private async loadWith(multithreaded: boolean, onProgress?: ProgressFn): Promise<FFmpeg> {
    const urls = await this.coreUrls(multithreaded, onProgress);
    const ffmpeg = new FFmpeg();
    this.attach(ffmpeg);
    const load = ffmpeg.load({ coreURL: urls.coreURL, wasmURL: urls.wasmURL, workerURL: urls.workerURL });
    // The core is already downloaded, so loading only instantiates it. If the browser refuses to start the
    // worker (for example a header problem), load() never settles; time out instead of hanging forever.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${multithreaded ? 'mt' : 'st'} load timeout`)), multithreaded ? MT_LOAD_TIMEOUT_MS : ST_LOAD_TIMEOUT_MS);
    });
    try {
      await Promise.race([load, timeout]);
    } catch (error) {
      ffmpeg.terminate();
      throw error;
    } finally {
      clearTimeout(timer);
    }
    await ffmpeg.createDir(INPUT_DIR).catch(() => undefined);
    await ffmpeg.createDir(WORK_DIR).catch(() => undefined);
    this.multithreaded = multithreaded;
    return ffmpeg;
  }

  /**
   * Loads the engine once. The single-threaded core is the default: in testing, the 0.12.10 multithreaded core
   * hung or crashed on most jobs (H.264+AAC, VP8, thumbnails, transpose). Opt in with VITE_FFMPEG_MULTITHREAD=true.
   */
  ensureLoaded(onProgress?: ProgressFn): Promise<FFmpeg> {
    if (this.ffmpeg?.loaded) return Promise.resolve(this.ffmpeg);
    const generation = this.generation;
    if (this.loading) return this.loading;
    // Assigned below; the finally block only clears it if no newer load replaced it.
    let loading: Promise<FFmpeg> | null = null;
    loading = (async () => {
      onProgress?.({ stage: 'loading-engine', fraction: null, message: 'Loading video engine' });
      const features = detectFeatures();
      const wantMt = features.crossOriginIsolated && features.sharedArrayBuffer && !this.mtBroken && import.meta.env.VITE_FFMPEG_MULTITHREAD === 'true';
      try {
        if (wantMt) {
          try {
            this.ffmpeg = this.adopt(await this.loadWith(true, onProgress), generation);
            return this.ffmpeg;
          } catch (error) {
            if (error instanceof MediaError && error.code === 'CANCELLED') throw error;
            console.warn('[ffmpeg] multithreaded core failed, falling back to single-threaded', error);
            this.mtBroken = true;
          }
        }
        this.ffmpeg = this.adopt(await this.loadWith(false, onProgress), generation);
        return this.ffmpeg;
      } catch (error) {
        throw error instanceof MediaError ? error : new MediaError('ENGINE_LOAD_FAILED', undefined, { cause: error });
      } finally {
        if (this.loading === loading) this.loading = null;
      }
    })();
    this.loading = loading;
    return loading;
  }

  /** Keeps a freshly loaded instance only if nothing was terminated while it loaded. */
  private adopt(ffmpeg: FFmpeg, generation: number): FFmpeg {
    if (generation !== this.generation) {
      ffmpeg.terminate();
      throw new MediaError('CANCELLED');
    }
    return ffmpeg;
  }

  /** Throws if the engine was terminated since `generation` (stops cancelled jobs from continuing). */
  private ensureCurrent(generation: number) {
    if (generation !== this.generation) throw new MediaError('CANCELLED');
  }

  /** Stops any running job immediately. The engine reloads (from cached blob URLs) on next use. */
  terminate() {
    this.generation++;
    this.ffmpeg?.terminate();
    this.ffmpeg = null;
    this.loading = null;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async withInput<T>(ffmpeg: FFmpeg, file: Blob, ext: string, fn: (path: string) => Promise<T>): Promise<T> {
    const name = `input.${ext.replace(/[^a-z0-9]/gi, '') || 'bin'}`;
    await ffmpeg.unmount(INPUT_DIR).catch(() => undefined);
    await ffmpeg.mount(FFFSType.WORKERFS, { blobs: [{ name, data: file }] }, INPUT_DIR);
    try {
      return await fn(`${INPUT_DIR}/${name}`);
    } finally {
      await ffmpeg.unmount(INPUT_DIR).catch(() => undefined);
    }
  }

  private async execLogged(ffmpeg: FFmpeg, args: string[], onLine?: (line: string) => void): Promise<{ code: number; log: string[] }> {
    const log: string[] = [];
    this.onLog = (line) => {
      log.push(line);
      if (log.length > 2000) log.splice(0, 1000);
      onLine?.(line);
    };
    try {
      const code = await ffmpeg.exec(args);
      return { code, log };
    } finally {
      this.onLog = null;
    }
  }

  private async probePath(ffmpeg: FFmpeg, path: string): Promise<VideoProbe | null> {
    const { log } = await this.execLogged(ffmpeg, ['-hide_banner', '-i', path]);
    return parseFfmpegProbe(log.join('\n'));
  }

  /** Wraps an operation with abort + timeout handling that terminates the engine. */
  private async guarded<T>(signal: AbortSignal | undefined, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
    if (signal?.aborted) throw new MediaError('CANCELLED');
    let onAbort: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interrupted = new Promise<never>((_, reject) => {
      onAbort = () => {
        this.terminate();
        reject(new MediaError('CANCELLED'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        this.terminate();
        reject(new MediaError('TIMEOUT'));
      }, timeoutMs);
    });
    try {
      return await Promise.race([fn(), interrupted]);
    } catch (error) {
      if (!(error instanceof MediaError)) {
        console.error('[ffmpeg]', error);
        if (this.multithreaded) {
          // The multithreaded core is less stable; fall back to the single-threaded core from now on.
          this.mtBroken = true;
          this.crashedOnMt = true;
          this.terminate();
        }
      }
      const mediaError = toMediaError(error);
      // After an abort, OOM or crash the WASM instance is unusable; reload next time.
      if (mediaError.code !== 'CANCELLED' && mediaError.code !== 'TIMEOUT' && /abort|memory|RuntimeError|terminate/i.test(String(error))) {
        this.terminate();
      }
      throw mediaError;
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Runs `fn` guarded; if it crashed on the multithreaded core, retries once on the single-threaded core. */
  private async withFallback<T>(signal: AbortSignal | undefined, timeoutMs: number, fn: () => Promise<T>): Promise<T> {
    this.crashedOnMt = false;
    try {
      return await this.guarded(signal, timeoutMs, fn);
    } catch (error) {
      if (!this.crashedOnMt) throw error;
      this.crashedOnMt = false;
      console.warn('[ffmpeg] retrying on the single-threaded core');
      return this.guarded(signal, timeoutMs, fn);
    }
  }

  probe(file: Blob, ext: string, { signal, onProgress }: { signal?: AbortSignal; onProgress?: ProgressFn } = {}): Promise<VideoProbe> {
    return this.exclusive(() =>
      this.withFallback(signal, 120_000, async () => {
        const ffmpeg = await this.ensureLoaded(onProgress);
        const generation = this.generation;
        onProgress?.({ stage: 'probing', fraction: null, message: 'Reading video details' });
        const probe = await this.withInput(ffmpeg, file, ext, (path) => this.probePath(ffmpeg, path));
        this.ensureCurrent(generation);
        if (!probe) throw new MediaError('CORRUPTED_FILE');
        return probe;
      }),
    );
  }

  run(
    file: Blob,
    ext: string,
    plan: FfmpegPlan,
    { signal, onProgress, timeoutMs = DEFAULT_JOB_TIMEOUT_MS }: { signal?: AbortSignal; onProgress?: ProgressFn; timeoutMs?: number } = {},
  ): Promise<FfmpegRunResult> {
    return this.exclusive(() =>
      this.withFallback(signal, timeoutMs, async () => {
        const ffmpeg = await this.ensureLoaded(onProgress);
        const generation = this.generation;
        return this.withInput(ffmpeg, file, ext, async () => {
          this.ensureCurrent(generation);
          let offset = 0;
          for (let i = 0; i < plan.passes.length; i++) {
            const weight = plan.passWeights[i] ?? 1 / plan.passes.length;
            const passLabel = plan.passes.length > 1 ? `Pass ${i + 1} of ${plan.passes.length}` : 'Processing';
            onProgress?.({ stage: 'processing', fraction: plan.progressDuration ? offset : null, message: passLabel });
            const { code, log } = await this.execLogged(ffmpeg, plan.passes[i]!, (line) => {
              if (!plan.progressDuration) return;
              const t = parseProgressTime(line);
              if (t !== null) {
                onProgress?.({ stage: 'processing', fraction: Math.min(0.999, offset + weight * Math.min(1, t / plan.progressDuration)), message: passLabel });
              }
            });
            this.ensureCurrent(generation);
            if (code !== 0) {
              console.error('[ffmpeg] exit code', code, log.slice(-30).join('\n'));
              throw classifyFailure(log);
            }
            offset += weight;
          }

          onProgress?.({ stage: 'verifying', fraction: null, message: 'Checking the output' });
          const outputProbe = await this.probePath(ffmpeg, plan.output);
          this.ensureCurrent(generation);
          const data = (await ffmpeg.readFile(plan.output)) as Uint8Array;
          await ffmpeg.deleteFile(plan.output).catch(() => undefined);
          const files = await ffmpeg.listDir(WORK_DIR).catch(() => []);
          await Promise.all(files.filter((f) => !f.isDir).map((f) => ffmpeg.deleteFile(`${WORK_DIR}/${f.name}`).catch(() => undefined)));
          return { data, outputProbe };
        });
      }),
    );
  }

  get workDir() {
    return WORK_DIR;
  }

  inputPath(ext: string) {
    return `${INPUT_DIR}/input.${ext.replace(/[^a-z0-9]/gi, '') || 'bin'}`;
  }
}

export const ffmpegEngine = new FfmpegEngine();
