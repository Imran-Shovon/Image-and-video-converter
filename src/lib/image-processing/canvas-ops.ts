// Canvas transforms that run on OffscreenCanvas, in workers or on the main thread.
import { clampRect, rotatedBounds } from './geometry';
import type { ImageOperation } from './types';

export type Drawable = OffscreenCanvas | ImageBitmap;

export function createCanvas(width: number, height: number): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** Frees canvas backing memory early; large canvases otherwise linger until GC. */
export function release(source: Drawable): void {
  if (source instanceof OffscreenCanvas) {
    source.width = 0;
    source.height = 0;
  } else {
    source.close();
  }
}

/** Draws a raw (unoriented) image applying EXIF orientation 1–8. */
export function applyExifOrientation(source: Drawable, orientation: number): OffscreenCanvas {
  const w = source.width;
  const h = source.height;
  const swap = orientation >= 5 && orientation <= 8;
  const { canvas, ctx } = createCanvas(swap ? h : w, swap ? w : h);
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, h, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, h, w); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, w); break;
    default: break;
  }
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function crop(source: Drawable, op: Extract<ImageOperation, { type: 'crop' }>): OffscreenCanvas {
  const r = clampRect(op.rect, source.width, source.height);
  const { canvas, ctx } = createCanvas(r.width, r.height);
  ctx.drawImage(source, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return canvas;
}

function rotate(source: Drawable, op: Extract<ImageOperation, { type: 'rotate' }>): OffscreenCanvas {
  const w = source.width;
  const h = source.height;
  const d = ((op.degrees % 360) + 360) % 360;
  const bounds = rotatedBounds(w, h, d);
  const { canvas, ctx } = createCanvas(bounds.width, bounds.height);
  if (d === 90) ctx.transform(0, 1, -1, 0, h, 0);
  else if (d === 180) ctx.transform(-1, 0, 0, -1, w, h);
  else if (d === 270) ctx.transform(0, -1, 1, 0, 0, w);
  else if (d !== 0) {
    ctx.fillStyle = op.background;
    ctx.fillRect(0, 0, bounds.width, bounds.height);
    ctx.translate(bounds.width / 2, bounds.height / 2);
    ctx.rotate((d * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
  }
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function flip(source: Drawable, op: Extract<ImageOperation, { type: 'flip' }>): OffscreenCanvas {
  const w = source.width;
  const h = source.height;
  const { canvas, ctx } = createCanvas(w, h);
  ctx.transform(op.horizontal ? -1 : 1, 0, 0, op.vertical ? -1 : 1, op.horizontal ? w : 0, op.vertical ? h : 0);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function applyMask(source: Drawable, op: Extract<ImageOperation, { type: 'mask' }>): OffscreenCanvas {
  if (op.mask.length !== op.maskWidth * op.maskHeight) throw new Error('Mask size does not match its dimensions');
  const alpha = new ImageData(op.maskWidth, op.maskHeight);
  for (let i = 0; i < op.mask.length; i++) alpha.data[i * 4 + 3] = op.mask[i]!;
  const maskCanvas = imageDataToCanvas(alpha);
  const { canvas, ctx } = createCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  // Keeps the image where the (smoothly upscaled) mask is opaque.
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  release(maskCanvas);
  if (op.background) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = op.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/** Stepped canvas downscale (halving) — used for previews; final resizes use the Lanczos WASM resizer. */
export function canvasResize(source: Drawable, width: number, height: number): OffscreenCanvas {
  let current: Drawable = source;
  while (current.width / 2 >= width && current.height / 2 >= height) {
    const { canvas, ctx } = createCanvas(Math.round(current.width / 2), Math.round(current.height / 2));
    ctx.drawImage(current, 0, 0, canvas.width, canvas.height);
    if (current !== source) release(current);
    current = canvas;
  }
  const { canvas, ctx } = createCanvas(width, height);
  ctx.drawImage(current, 0, 0, width, height);
  if (current !== source) release(current);
  return canvas;
}

/** Applies crop/rotate/flip/mask. Resize is handled by the caller because it needs the WASM resizer. */
export function applyGeometricOp(source: Drawable, op: Exclude<ImageOperation, { type: 'resize' }>): OffscreenCanvas {
  switch (op.type) {
    case 'crop':
      return crop(source, op);
    case 'rotate':
      return rotate(source, op);
    case 'flip':
      return flip(source, op);
    case 'mask':
      return applyMask(source, op);
  }
}

export function toCanvas(source: Drawable): OffscreenCanvas {
  if (source instanceof OffscreenCanvas) return source;
  const { canvas, ctx } = createCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

export function imageDataToCanvas(data: ImageData): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(data.width, data.height);
  ctx.putImageData(data, 0, 0);
  return canvas;
}

export function readImageData(source: OffscreenCanvas): ImageData {
  const ctx = source.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return ctx.getImageData(0, 0, source.width, source.height);
}

export function hasTransparency(data: ImageData | Uint8ClampedArray): boolean {
  const px = data instanceof ImageData ? data.data : data;
  for (let i = 3; i < px.length; i += 4) if (px[i]! < 255) return true;
  return false;
}

/** Composites the image over a solid colour so formats without alpha don't turn transparent areas black. */
export function flattenOnto(source: Drawable, background: string): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(source.width, source.height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0);
  return canvas;
}
