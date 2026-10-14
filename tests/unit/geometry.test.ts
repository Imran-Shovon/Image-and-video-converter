import { describe, expect, it } from 'vitest';
import { centeredAspectRect, clampRect, fitWithin, floorEven, resolveResize, rotatedBounds, sizeAfterOps } from '@/lib/image-processing/geometry';

describe('geometry', () => {
  it('clamps crop rectangles inside the image', () => {
    expect(clampRect({ x: -5, y: 10.4, width: 300, height: 50 }, 200, 100)).toEqual({ x: 0, y: 10, width: 200, height: 50 });
    expect(clampRect({ x: 190, y: 90, width: 50, height: 50 }, 200, 100)).toEqual({ x: 190, y: 90, width: 10, height: 10 });
    expect(clampRect({ x: 0, y: 0, width: 0, height: 0 }, 10, 10)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('computes rotated bounds exactly for right angles', () => {
    expect(rotatedBounds(400, 300, 90)).toEqual({ width: 300, height: 400 });
    expect(rotatedBounds(400, 300, -90)).toEqual({ width: 300, height: 400 });
    expect(rotatedBounds(400, 300, 180)).toEqual({ width: 400, height: 300 });
    expect(rotatedBounds(100, 100, 45)).toEqual({ width: 141, height: 141 });
  });

  it('applies operation sizes in order', () => {
    expect(
      sizeAfterOps(4000, 3000, [
        { type: 'rotate', degrees: 90, background: '#fff' },
        { type: 'crop', rect: { x: 0, y: 0, width: 1000, height: 2000 } },
        { type: 'flip', horizontal: true, vertical: false },
        { type: 'resize', width: 500, height: 1000 },
      ]),
    ).toEqual({ width: 500, height: 1000 });
  });

  it('resolves resize requests', () => {
    expect(resolveResize({ width: 4000, height: 3000 }, { mode: 'percent', percent: 25, lockAspect: true })).toEqual({ width: 1000, height: 750 });
    expect(resolveResize({ width: 4000, height: 3000 }, { mode: 'pixels', width: 800, lockAspect: true })).toEqual({ width: 800, height: 600 });
    expect(resolveResize({ width: 4000, height: 3000 }, { mode: 'pixels', height: 300, lockAspect: true })).toEqual({ width: 400, height: 300 });
    expect(resolveResize({ width: 4000, height: 3000 }, { mode: 'pixels', width: 800, height: 800, lockAspect: false })).toEqual({ width: 800, height: 800 });
  });

  it('fits within a box without upscaling', () => {
    expect(fitWithin({ width: 4000, height: 2000 }, 1000, 1000)).toEqual({ width: 1000, height: 500 });
    expect(fitWithin({ width: 100, height: 50 }, 1000, 1000)).toEqual({ width: 100, height: 50 });
  });

  it('centres aspect-ratio crops', () => {
    expect(centeredAspectRect({ width: 1600, height: 900 }, 1)).toEqual({ x: 350, y: 0, width: 900, height: 900 });
    expect(centeredAspectRect({ width: 1000, height: 1000 }, 16 / 9)).toMatchObject({ x: 0, width: 1000 });
  });

  it('snaps to even numbers', () => {
    expect(floorEven(1081)).toBe(1080);
    expect(floorEven(1)).toBe(2);
  });
});
