// Image worker: all decoding, transforming and encoding happens here so the UI never blocks.
import * as Comlink from 'comlink';
import { MediaError, serializeError } from '@/lib/media/errors';
import { NO_OFFSCREEN_CANVAS } from '@/lib/media/features';
import { inspectImage, processImage } from '@/lib/image-processing/pipeline';
import type { ImageJobInput, ImageProgress } from '@/lib/image-processing/types';

// Errors are re-thrown as plain objects so the error code survives structured cloning.
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new MediaError('CODEC_UNAVAILABLE', NO_OFFSCREEN_CANVAS);
    return await fn();
  } catch (error) {
    console.error('[image worker]', error);
    throw serializeError(error);
  }
}

const api = {
  inspect: (file: Blob, maxEdge: number) => guard(() => inspectImage(file, maxEdge)),
  process: (job: ImageJobInput, onProgress: (p: ImageProgress) => void) => guard(() => processImage(job, onProgress)),
};

export type ImageWorkerApi = typeof api;

Comlink.expose(api);
