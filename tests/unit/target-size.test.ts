import { describe, expect, it } from 'vitest';
import { searchTargetSize } from '@/lib/image-processing/target-size';

// Fake encoder: size grows linearly with quality and with pixel count (scale²).
const fakeEncoder = (bytesAtQ100: number) => async (quality: number, scale: number) =>
  new Uint8Array(Math.round(bytesAtQ100 * (0.1 + 0.9 * (quality / 100)) * scale * scale));

describe('searchTargetSize', () => {
  it('finds the highest quality under the target within 8 iterations', async () => {
    let calls = 0;
    const encode = fakeEncoder(100_000);
    const result = await searchTargetSize({
      targetBytes: 50_000,
      minQuality: 5,
      maxQuality: 100,
      allowDownscale: false,
      encode: async (q, s) => {
        calls++;
        return encode(q, s);
      },
    });
    expect(result.met).toBe(true);
    expect(result.best.bytes).toBeLessThanOrEqual(50_000);
    expect(result.best.quality).toBeGreaterThanOrEqual(42);
    expect(result.best.quality).toBeLessThanOrEqual(44);
    expect(calls).toBeLessThanOrEqual(8);
  });

  it('reports the closest result honestly when the target is unreachable', async () => {
    const result = await searchTargetSize({ targetBytes: 1_000, minQuality: 5, maxQuality: 100, allowDownscale: false, encode: fakeEncoder(100_000) });
    expect(result.met).toBe(false);
    expect(result.downscaled).toBe(false);
    expect(result.best.bytes).toBeGreaterThan(1_000);
    expect(result.best.quality).toBe(5);
  });

  it('downscales when allowed and reaches the target', async () => {
    const result = await searchTargetSize({ targetBytes: 5_000, minQuality: 5, maxQuality: 100, allowDownscale: true, encode: fakeEncoder(100_000) });
    expect(result.met).toBe(true);
    expect(result.downscaled).toBe(true);
    expect(result.best.scale).toBeLessThan(1);
    expect(result.best.bytes).toBeLessThanOrEqual(5_000);
  });

  it('handles a fixed-quality (lossless) encoder via downscale only', async () => {
    const result = await searchTargetSize({ targetBytes: 30_000, minQuality: 100, maxQuality: 100, allowDownscale: true, encode: fakeEncoder(100_000) });
    expect(result.met).toBe(true);
    expect(result.best.quality).toBe(100);
    expect(result.best.scale).toBeLessThan(0.6);
  });
});
