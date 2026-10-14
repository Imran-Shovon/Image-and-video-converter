// Main-thread client for the image worker. Cancelling terminates the worker; a fresh one is created on demand.
import * as Comlink from 'comlink';
import { MediaError, toMediaError } from '@/lib/media/errors';
import { getLimits } from '@/lib/media/limits';
import type { ImageWorkerApi } from '@/workers/image.worker';
import type { InspectResult } from './pipeline';
import type { ImageJobInput, ImageJobResult, ImageProgress } from './types';

interface Slot {
  worker: Worker;
  api: Comlink.Remote<ImageWorkerApi>;
  busy: boolean;
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (p: ImageProgress) => void;
}

const IDLE_TERMINATE_MS = 60_000;

class ImageEngine {
  private slots: Slot[] = [];
  private waiters: (() => void)[] = [];
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  private get maxWorkers() {
    return Math.max(1, Math.min(getLimits().concurrentImageJobs, navigator.hardwareConcurrency || 2));
  }

  private spawn(): Slot {
    const worker = new Worker(new URL('../../workers/image.worker.ts', import.meta.url), { type: 'module', name: 'image-worker' });
    const slot: Slot = { worker, api: Comlink.wrap<ImageWorkerApi>(worker), busy: false };
    this.slots.push(slot);
    return slot;
  }

  private kill(slot: Slot) {
    slot.api[Comlink.releaseProxy]();
    slot.worker.terminate();
    this.slots = this.slots.filter((s) => s !== slot);
    this.waiters.shift()?.();
  }

  private async acquire(signal?: AbortSignal): Promise<Slot> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    for (;;) {
      if (signal?.aborted) throw new MediaError('CANCELLED');
      const free = this.slots.find((s) => !s.busy);
      if (free) {
        free.busy = true;
        return free;
      }
      if (this.slots.length < this.maxWorkers) {
        const slot = this.spawn();
        slot.busy = true;
        return slot;
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  private releaseSlot(slot: Slot) {
    slot.busy = false;
    this.waiters.shift()?.();
    if (this.slots.every((s) => !s.busy)) {
      this.idleTimer = setTimeout(() => this.slots.filter((s) => !s.busy).forEach((s) => this.kill(s)), IDLE_TERMINATE_MS);
    }
  }

  /** Runs a worker call; aborting terminates that worker so the work stops immediately. */
  private async call<T>(fn: (api: Comlink.Remote<ImageWorkerApi>) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const slot = await this.acquire(signal);
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => {
        this.kill(slot);
        reject(new MediaError('CANCELLED'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    const crashed = new Promise<never>((_, reject) => {
      slot.worker.onerror = (event) => {
        event.preventDefault();
        this.kill(slot);
        reject(toMediaError(new Error(event.message || 'Worker crashed'), 'OUT_OF_MEMORY'));
      };
    });
    try {
      return await Promise.race([fn(slot.api), aborted, crashed]);
    } catch (error) {
      const mediaError = toMediaError(error);
      // A WASM module that ran out of memory can be left in a broken state; start fresh next time.
      if (mediaError.code === 'OUT_OF_MEMORY' && this.slots.includes(slot)) this.kill(slot);
      throw mediaError;
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
      if (this.slots.includes(slot)) this.releaseSlot(slot);
    }
  }

  /** Decodes the file once: stream facts plus a downscaled preview. */
  inspect(file: Blob, maxEdge = 1600, signal?: AbortSignal): Promise<InspectResult> {
    return this.call((api) => api.inspect(file, maxEdge), signal);
  }

  process(job: ImageJobInput, { signal, onProgress }: RunOptions = {}): Promise<ImageJobResult> {
    return this.call((api) => api.process(job, Comlink.proxy((p: ImageProgress) => onProgress?.(p))), signal);
  }
}

export const imageEngine = new ImageEngine();
