// Main-thread client for the background-removal worker. One job at a time (the model holds a lot of GPU
// memory); cancelling terminates the worker, and an idle worker is terminated to give that memory back.
import * as Comlink from 'comlink';
import { MediaError, toMediaError } from '@/lib/media/errors';
import type { ImageProgress } from '@/lib/image-processing/types';
import type { BackgroundWorkerApi, SegmentResult } from '@/workers/background.worker';
import model from './model.json';

const IDLE_TERMINATE_MS = 180_000;

export const MODEL_INFO = { name: model.name, license: model.license, inputSize: model.inputSize };

/** Approximate one-time download for this device (fp16 needs the `shader-f16` GPU feature). */
export function modelDownloadBytes(f16: boolean): number {
  return f16 ? 115_000_000 : 224_000_000;
}

export type WebGpuSupport = { available: true; f16: boolean } | { available: false };

let support: Promise<WebGpuSupport> | null = null;

/** Checks for a usable WebGPU adapter (cached). */
export function detectWebGpu(): Promise<WebGpuSupport> {
  support ??= (async () => {
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      return adapter ? { available: true, f16: adapter.features.has('shader-f16') } : { available: false };
    } catch {
      return { available: false };
    }
  })();
  return support;
}

class BackgroundEngine {
  private worker: Worker | null = null;
  private api: Comlink.Remote<BackgroundWorkerApi> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private ensure(): Comlink.Remote<BackgroundWorkerApi> {
    if (!this.api) {
      this.worker = new Worker(new URL('../../workers/background.worker.ts', import.meta.url), { type: 'module', name: 'background-worker' });
      this.api = Comlink.wrap<BackgroundWorkerApi>(this.worker);
    }
    return this.api;
  }

  private terminate() {
    this.api?.[Comlink.releaseProxy]();
    this.worker?.terminate();
    this.api = null;
    this.worker = null;
  }

  /** Segments the subject in `image` (any displayable image; it is scaled to the model's input size). */
  segment(image: Blob, { signal, onProgress }: { signal?: AbortSignal; onProgress?: (p: ImageProgress) => void } = {}): Promise<SegmentResult> {
    const run = async () => {
      if (signal?.aborted) throw new MediaError('CANCELLED');
      if (this.idleTimer) clearTimeout(this.idleTimer);
      const api = this.ensure();
      const worker = this.worker!;
      let onAbort: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => {
          this.terminate();
          reject(new MediaError('CANCELLED'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      const crashed = new Promise<never>((_, reject) => {
        worker.onerror = (event) => {
          event.preventDefault();
          this.terminate();
          reject(toMediaError(new Error(event.message || 'Worker crashed'), 'OUT_OF_MEMORY'));
        };
      });
      try {
        return await Promise.race([api.segment(image, Comlink.proxy((p: ImageProgress) => onProgress?.(p))), aborted, crashed]);
      } catch (error) {
        const mediaError = toMediaError(error);
        // A failed GPU session can be left unusable; start fresh next time.
        if (mediaError.code !== 'CANCELLED') this.terminate();
        throw mediaError;
      } finally {
        if (onAbort) signal?.removeEventListener('abort', onAbort);
        this.idleTimer = setTimeout(() => this.terminate(), IDLE_TERMINATE_MS);
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}

export const backgroundEngine = new BackgroundEngine();
