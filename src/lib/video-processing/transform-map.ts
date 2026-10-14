// Maps our transform order (crop → rotate → flipH → flipV) onto Mediabunny's order (rotate → flipH → crop).
// Pure so it can be unit-tested.
import type { CropBox, Rotation } from './types';

export interface MediabunnyGeometry {
  rotate: Rotation;
  flip: boolean;
  /** Crop rectangle in the rotated + flipped frame. */
  crop?: { left: number; top: number; width: number; height: number };
}

/** Rectangle (x, y, w, h) in a W×H frame, after rotating the frame clockwise. */
export function rotateRect(r: CropBox, frameW: number, frameH: number, rotation: Rotation): CropBox {
  switch (rotation) {
    case 0:
      return r;
    case 90:
      return { x: frameH - r.y - r.height, y: r.x, width: r.height, height: r.width };
    case 180:
      return { x: frameW - r.x - r.width, y: frameH - r.y - r.height, width: r.width, height: r.height };
    case 270:
      return { x: r.y, y: frameW - r.x - r.width, width: r.height, height: r.width };
  }
}

export function toMediabunnyGeometry(
  displayW: number,
  displayH: number,
  t: { crop?: CropBox; rotate?: Rotation; flipH?: boolean; flipV?: boolean },
): MediabunnyGeometry {
  // A vertical flip equals a horizontal flip plus a 180° rotation, and 180° rotation commutes with flips.
  const flipV = t.flipV ?? false;
  const flipH = t.flipH ?? false;
  const rotate = ((((t.rotate ?? 0) + (flipV ? 180 : 0)) % 360) as Rotation);
  const flip = flipH !== flipV;
  if (!t.crop) return { rotate, flip };

  let rect = rotateRect(t.crop, displayW, displayH, rotate);
  const swapped = rotate === 90 || rotate === 270;
  const frameW = swapped ? displayH : displayW;
  if (flip) rect = { ...rect, x: frameW - rect.x - rect.width };
  return { rotate, flip, crop: { left: rect.x, top: rect.y, width: rect.width, height: rect.height } };
}
