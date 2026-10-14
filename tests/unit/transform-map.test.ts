import { describe, expect, it } from 'vitest';
import { toMediabunnyGeometry } from '@/lib/video-processing/transform-map';
import type { CropBox, Rotation } from '@/lib/video-processing/types';

// Brute-force check: simulate both pipelines on a small labelled grid and compare the resulting pixels.
type Grid = number[][];

const makeGrid = (w: number, h: number): Grid => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => y * w + x));
const crop = (g: Grid, r: CropBox): Grid => g.slice(r.y, r.y + r.height).map((row) => row.slice(r.x, r.x + r.width));
const rotate90 = (g: Grid): Grid => g[0]!.map((_, x) => g.map((row) => row[x]!).reverse());
const rotate = (g: Grid, deg: Rotation): Grid => {
  let out = g;
  for (let i = 0; i < deg / 90; i++) out = rotate90(out);
  return out;
};
const flipH = (g: Grid): Grid => g.map((row) => [...row].reverse());
const flipV = (g: Grid): Grid => [...g].reverse();

describe('toMediabunnyGeometry', () => {
  const W = 7;
  const H = 5;
  const rect: CropBox = { x: 1, y: 1, width: 4, height: 3 };
  const rotations: Rotation[] = [0, 90, 180, 270];

  for (const r of rotations) {
    for (const h of [false, true]) {
      for (const v of [false, true]) {
        it(`rotate ${r}, flipH ${h}, flipV ${v}`, () => {
          // Our order: crop → rotate → flipH → flipV
          let ours = rotate(crop(makeGrid(W, H), rect), r);
          if (h) ours = flipH(ours);
          if (v) ours = flipV(ours);

          // Mediabunny order: rotate → flip(H) → crop
          const m = toMediabunnyGeometry(W, H, { crop: rect, rotate: r, flipH: h, flipV: v });
          let theirs = rotate(makeGrid(W, H), m.rotate);
          if (m.flip) theirs = flipH(theirs);
          theirs = crop(theirs, { x: m.crop!.left, y: m.crop!.top, width: m.crop!.width, height: m.crop!.height });

          expect(theirs).toEqual(ours);
        });
      }
    }
  }
});
