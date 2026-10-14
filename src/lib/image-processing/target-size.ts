// Best-effort target file size (spec §A2): binary search over quality, then optional downscaling.
// Pure and engine-agnostic so it can be unit-tested with a fake encoder.

export interface Attempt {
  quality: number;
  scale: number;
  bytes: number;
  data: Uint8Array;
}

export interface TargetSearchOptions {
  targetBytes: number;
  minQuality: number;
  maxQuality: number;
  maxIterations?: number;
  allowDownscale: boolean;
  /** Maximum downscale rounds after the quality search fails. */
  maxDownscaleRounds?: number;
  /** Smallest allowed scale factor. */
  minScale?: number;
  encode: (quality: number, scale: number) => Promise<Uint8Array>;
  onAttempt?: (attempt: number, total: number) => void;
}

export interface TargetSearchResult {
  best: Attempt;
  met: boolean;
  downscaled: boolean;
  attempts: number;
}

async function searchQuality(scale: number, opts: TargetSearchOptions, counter: { n: number; total: number }) {
  const maxIterations = opts.maxIterations ?? 8;
  let lo = opts.minQuality;
  let hi = opts.maxQuality;
  let bestFit: Attempt | null = null;
  let smallest: Attempt | null = null;

  for (let i = 0; i < maxIterations && lo <= hi; i++) {
    const quality = Math.round((lo + hi) / 2);
    const data = await opts.encode(quality, scale);
    counter.n++;
    opts.onAttempt?.(counter.n, counter.total);
    const attempt: Attempt = { quality, scale, bytes: data.byteLength, data };
    if (!smallest || attempt.bytes < smallest.bytes) smallest = attempt;
    if (attempt.bytes <= opts.targetBytes) {
      if (!bestFit || attempt.quality > bestFit.quality) bestFit = attempt;
      lo = quality + 1;
    } else {
      hi = quality - 1;
    }
  }
  return { bestFit, smallest: smallest! };
}

export async function searchTargetSize(opts: TargetSearchOptions): Promise<TargetSearchResult> {
  const rounds = opts.allowDownscale ? (opts.maxDownscaleRounds ?? 3) : 0;
  const counter = { n: 0, total: (opts.maxIterations ?? 8) * (1 + rounds) };
  let scale = 1;
  let { bestFit, smallest } = await searchQuality(scale, opts, counter);
  let overallSmallest = smallest;
  if (bestFit) return { best: bestFit, met: true, downscaled: false, attempts: counter.n };

  const minScale = opts.minScale ?? 0.1;
  for (let round = 0; round < rounds; round++) {
    // File size scales roughly with pixel count, so shrink each side by sqrt of the ratio, with a safety margin.
    const ratio = opts.targetBytes / smallest.bytes;
    const next = Math.max(minScale, Math.min(0.95, Math.sqrt(ratio) * 0.95)) * scale;
    if (next >= scale - 1e-3 || scale <= minScale) break;
    scale = next;
    ({ bestFit, smallest } = await searchQuality(scale, opts, counter));
    if (smallest.bytes < overallSmallest.bytes) overallSmallest = smallest;
    if (bestFit) return { best: bestFit, met: true, downscaled: true, attempts: counter.n };
  }
  return { best: overallSmallest, met: false, downscaled: overallSmallest.scale < 1, attempts: counter.n };
}
