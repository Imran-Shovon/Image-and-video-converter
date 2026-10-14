// Runtime feature detection (spec §13). Never relies on user-agent sniffing.

/** Shown when image processing can't run because the browser lacks OffscreenCanvas. */
export const NO_OFFSCREEN_CANVAS =
  "This browser can't process images in the background (OffscreenCanvas is missing). Use a recent Chrome, Edge, Firefox or Safari 16.4+.";

export interface BrowserFeatures {
  offscreenCanvas: boolean;
  webCodecs: boolean;
  imageDecoder: boolean;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  webAssembly: boolean;
  workers: boolean;
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
}

export function detectFeatures(): BrowserFeatures {
  const g = globalThis as typeof globalThis & { crossOriginIsolated?: boolean };
  return {
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    webCodecs: typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined',
    imageDecoder: typeof (g as { ImageDecoder?: unknown }).ImageDecoder !== 'undefined',
    crossOriginIsolated: g.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webAssembly: typeof WebAssembly === 'object',
    workers: typeof Worker !== 'undefined',
    hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1,
    deviceMemoryGb:
      typeof navigator !== 'undefined' ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null) : null,
  };
}
