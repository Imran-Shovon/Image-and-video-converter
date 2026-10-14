// Video job orchestration: probe → choose engine → run → verify (spec §6, §8).
import { videoOutputCapability } from '@/lib/media/capabilities';
import { MediaError, toMediaError } from '@/lib/media/errors';
import { getLimits } from '@/lib/media/limits';
import { buildPlan, buildPreviewProxyPlan } from './args';
import { ffmpegEngine } from './ffmpeg-engine';
import type { VideoJob, VideoJobResult, VideoProbe, VideoProgress } from './types';
import { verifyMediaOutput } from './verify';
import { planWebCodecs, probeWithMediabunny, runWebCodecs } from './webcodecs-engine';

export type EnginePreference = 'auto' | 'ffmpeg';

interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (p: VideoProgress) => void;
  engine?: EnginePreference;
}

/** Reads stream info. Uses Mediabunny when it can parse the file (no 32 MB download), otherwise ffmpeg.wasm. */
export async function probeVideo(file: Blob, ext: string, { signal, onProgress }: RunOptions = {}): Promise<VideoProbe> {
  onProgress?.({ stage: 'probing', fraction: null, message: 'Reading video details' });
  const quick = await probeWithMediabunny(file);
  if (signal?.aborted) throw new MediaError('CANCELLED');
  const complete = quick && quick.durationSec !== null && (!quick.video || quick.video.codec !== 'unknown') && (!quick.audio || quick.audio.codec !== 'unknown');
  if (complete) return quick;
  return ffmpegEngine.probe(file, ext, { signal, onProgress });
}

async function verifyBlob(data: Uint8Array, expect: Parameters<typeof verifyMediaOutput>[3], probeFn: () => Promise<VideoProbe | null>) {
  const probe = await probeFn();
  verifyMediaOutput(data.subarray(0, 4100), data.byteLength, probe, expect);
  return probe;
}

export async function runVideoJob(file: Blob, ext: string, probe: VideoProbe, job: VideoJob, options: RunOptions = {}): Promise<VideoJobResult> {
  const { signal, onProgress, engine = 'auto' } = options;
  const notes: string[] = [];

  // Some outputs (VP9) are only encoded with WebCodecs because the ffmpeg.wasm encoder is unreliable.
  const webCodecsOnly = job.type === 'encode' && !videoOutputCapability(job.output).engines.includes('ffmpeg-wasm');
  if (job.type === 'encode' && (engine === 'auto' || webCodecsOnly)) {
    const plan = await planWebCodecs(job, probe, file).catch(() => null);
    if (plan) {
      try {
        const data = await runWebCodecs(job, probe, file, { signal, onProgress });
        onProgress?.({ stage: 'verifying', fraction: null, message: 'Checking the output' });
        const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: plan.mime });
        const outputProbe = await verifyBlob(data, plan.expect, () => probeWithMediabunny(blob));
        return { blob, filenameExt: plan.ext, mime: plan.mime, bytes: data.byteLength, probe: outputProbe, engine: 'webcodecs', notes: [...plan.notes] };
      } catch (error) {
        const mediaError = toMediaError(error);
        if (mediaError.code === 'CANCELLED' || webCodecsOnly) throw mediaError;
        console.warn('[video] WebCodecs path failed, falling back to ffmpeg.wasm', error);
        notes.push('The browser’s built-in encoder could not handle this job, so the compatible engine was used.');
      }
    }
  }

  if (webCodecsOnly && job.type === 'encode') {
    throw new MediaError(
      'CODEC_UNAVAILABLE',
      `${videoOutputCapability(job.output).label} needs your browser’s built-in WebCodecs encoder, which can’t handle this file here. Choose MP4 (H.264) or WebM (VP8) instead.`,
    );
  }

  const plan = buildPlan(job, { input: ffmpegEngine.inputPath(ext), workDir: ffmpegEngine.workDir, probe }, getLimits().gifSeconds);
  const { data, outputProbe } = await ffmpegEngine.run(file, ext, plan, { signal, onProgress });
  verifyMediaOutput(data.subarray(0, 4100), data.byteLength, outputProbe, plan.expect);
  return {
    blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: plan.mime }),
    filenameExt: plan.ext,
    mime: plan.mime,
    bytes: data.byteLength,
    probe: outputProbe,
    engine: 'ffmpeg-wasm',
    notes: [...notes, ...plan.notes],
  };
}

/** Low-resolution H.264 proxy so the crop/trim UI works for sources the browser can't play (MKV, HEVC, ProRes…). */
export async function makePreviewProxy(file: Blob, ext: string, probe: VideoProbe, options: RunOptions = {}): Promise<Blob> {
  const plan = buildPreviewProxyPlan({ input: ffmpegEngine.inputPath(ext), workDir: ffmpegEngine.workDir, probe });
  const { data } = await ffmpegEngine.run(file, ext, plan, options);
  if (data.byteLength === 0) throw new MediaError('ENCODER_FAILED');
  return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
}

export function cancelVideoEngine() {
  ffmpegEngine.terminate();
}
