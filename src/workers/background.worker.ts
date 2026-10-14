// Background-removal worker: runs the BiRefNet-lite segmentation model with onnxruntime-web on WebGPU.
// The model is self-hosted, downloaded once with progress and kept in Cache Storage for later visits.
import * as Comlink from 'comlink';
import * as ort from 'onnxruntime-web/webgpu';
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url';
import model from '@/lib/background-removal/model.json';
import { MediaError, serializeError } from '@/lib/media/errors';
import type { ImageProgress } from '@/lib/image-processing/types';

type Variant = keyof typeof model.variants;

interface Manifest {
  variants: Record<Variant, { file: string; bytes: number; sha256: string }>;
}

export interface SegmentResult {
  /** Alpha mask, `size`×`size`, one byte per pixel. */
  mask: Uint8Array;
  size: number;
  variant: Variant;
}

const CACHE_NAME = 'media-toolkit-models';
const SIZE = model.inputSize;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;
const base = new URL(`${import.meta.env.BASE_URL}${model.dir}/`, self.location.origin);

// The CPU part of the graph is tiny (index arithmetic); one thread avoids extra workers and memory.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: ortWasmUrl };

let session: Promise<{ session: ort.InferenceSession; variant: Variant }> | null = null;

/** Checks that a WebGPU device can be created and picks the model variant the GPU can run. */
async function pickVariant(): Promise<Variant> {
  const adapter = await navigator.gpu?.requestAdapter().catch(() => null);
  const unavailable = 'Background removal needs WebGPU, which this browser or device does not provide.';
  if (!adapter) throw new MediaError('CODEC_UNAVAILABLE', unavailable);
  // Some systems expose an adapter but cannot create a device (e.g. missing GPU drivers or shader compiler).
  const device = await adapter.requestDevice().catch(() => null);
  if (!device) throw new MediaError('CODEC_UNAVAILABLE', unavailable);
  device.destroy();
  // This probe adapter is now consumed; onnxruntime requests its own.
  return adapter.features.has('shader-f16') ? 'fp16' : 'fp32';
}

async function openCache(): Promise<Cache | null> {
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/** Downloads the model with progress, using (and filling) Cache Storage when available. */
async function loadModelBytes(variant: Variant, onProgress: (p: ImageProgress) => void): Promise<Uint8Array> {
  const manifest = (await fetch(new URL('manifest.json', base)).then((r) => (r.ok ? r.json() : null)).catch(() => null)) as Manifest | null;
  const entry = manifest?.variants[variant];
  if (!entry) throw new MediaError('NETWORK_ERROR', 'The background-removal model is not available on this server.');
  const url = new URL(entry.file, base).href;

  const cache = await openCache();
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    onProgress({ stage: 'model', fraction: null, message: 'Loading the AI model from this device' });
    const bytes = new Uint8Array(await cached.arrayBuffer());
    if (bytes.byteLength === entry.bytes) return bytes;
  }
  // Remove models from older releases so they don't take up storage forever.
  if (cache) for (const request of await cache.keys().catch(() => [])) if (request.url !== url) await cache.delete(request).catch(() => false);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new MediaError('NETWORK_ERROR', 'The AI model could not be downloaded. Check your connection and try again.', { cause: error });
  }
  if (!response.ok || !response.body) throw new MediaError('NETWORK_ERROR', `The AI model could not be downloaded (HTTP ${response.status}).`);
  const bytes = new Uint8Array(entry.bytes);
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > bytes.byteLength) throw new MediaError('NETWORK_ERROR', 'The AI model download was larger than expected.');
    bytes.set(value, received);
    received += value.byteLength;
    onProgress({ stage: 'download', fraction: received / bytes.byteLength, message: `Downloading the AI model (one time, ${Math.round(entry.bytes / 1e6)} MB)` });
  }
  if (received !== bytes.byteLength) throw new MediaError('NETWORK_ERROR', 'The AI model download was incomplete. Try again.');
  await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })).catch(() => undefined);
  return bytes;
}

function getSession(onProgress: (p: ImageProgress) => void) {
  session ??= (async () => {
    const variant = await pickVariant();
    const bytes = await loadModelBytes(variant, onProgress);
    onProgress({ stage: 'model', fraction: null, message: 'Preparing the AI model' });
    const created = await ort.InferenceSession.create(bytes, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
      // The model's index arithmetic is int64; without this those nodes fall back to the CPU and exhaust WASM memory.
      extra: { ep: { webgpuexecutionprovider: { enableInt64: '1' } } },
    });
    return { session: created, variant };
  })();
  session.catch(() => {
    session = null;
  });
  return session;
}

/** RGB → normalised CHW float tensor at the model's input size. */
function toTensor(bitmap: ImageBitmap): ort.Tensor {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (data[i * 4 + c]! / 255 - MEAN[c]!) / STD[c]!;
  }
  canvas.width = 0;
  return new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]);
}

const api = {
  async segment(image: Blob, onProgress: (p: ImageProgress) => void): Promise<SegmentResult> {
    try {
      const { session: s, variant } = await getSession(onProgress);
      onProgress({ stage: 'segment', fraction: null, message: 'Finding the subject' });
      const bitmap = await createImageBitmap(image);
      const input = toTensor(bitmap);
      bitmap.close();
      const outputs = await s.run({ [s.inputNames[0]!]: input });
      const logits = outputs[s.outputNames[0]!]!;
      const values = logits.data as Float32Array;
      if (values.length !== SIZE * SIZE) throw new MediaError('ENCODER_FAILED', 'The AI model returned an unexpected result.');
      const mask = new Uint8Array(values.length);
      let kept = 0;
      for (let i = 0; i < values.length; i++) {
        mask[i] = Math.round(255 / (1 + Math.exp(-values[i]!)));
        if (mask[i]! > 127) kept++;
      }
      input.dispose();
      logits.dispose();
      // An (almost) empty mask would produce a blank image; say so instead of returning it.
      if (kept < values.length * 0.002) {
        throw new MediaError('VALIDATION_FAILED', 'No clear subject was found in this image, so there was nothing to keep. Try a photo with a distinct foreground subject.');
      }
      return Comlink.transfer({ mask, size: SIZE, variant }, [mask.buffer]);
    } catch (error) {
      console.error('[background worker]', error);
      throw serializeError(error);
    }
  },
};

export type BackgroundWorkerApi = typeof api;
Comlink.expose(api);
