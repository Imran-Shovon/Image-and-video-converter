import { describe, expect, it } from 'vitest';
import { alphaMaskFromLogits } from '@/lib/background-removal/mask';

describe('background-removal mask', () => {
  it('removes background, keeps foreground, and retains soft edge opacity', () => {
    const mask = alphaMaskFromLogits(new Float32Array([-10, -3, -1, 0, 1, 3, 10, -10, 10]), 3);
    expect(Array.from(mask)).toEqual([0, 12, 69, 128, 186, 243, 255, 0, 255]);
  });

  it('rejects a uniform mask that would merely fade the entire image', () => {
    expect(() => alphaMaskFromLogits(new Float32Array(100), 10)).toThrow(
      /could not separate the background/,
    );
  });

  it('rejects opaque output that would leave the original background intact', () => {
    expect(() => alphaMaskFromLogits(new Float32Array(100).fill(10), 10)).toThrow(
      /could not separate the background/,
    );
  });

  it('rejects an empty foreground instead of saving a blank image', () => {
    expect(() => alphaMaskFromLogits(new Float32Array(100).fill(-10), 10)).toThrow(
      /No clear subject/,
    );
  });

  it.each([NaN, Infinity, -Infinity])('rejects non-finite output (%s)', (value) => {
    expect(() => alphaMaskFromLogits(new Float32Array([value, -10, 10, 10]), 2)).toThrow(
      /usable cutout/,
    );
  });

  it('rejects incorrect mask dimensions', () => {
    expect(() => alphaMaskFromLogits(new Float32Array(3), 2)).toThrow(/unexpected mask size/);
  });
});
