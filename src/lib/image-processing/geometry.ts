// Pure geometry helpers shared by the cropper UI, the image pipeline and tests.
import type { ImageOperation, Rect } from './types';

export interface Size {
  width: number;
  height: number;
}

/** Rounds a rectangle to whole pixels and clamps it inside a width×height image (minimum 1×1). */
export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = Math.min(Math.max(0, Math.round(rect.x)), width - 1);
  const y = Math.min(Math.max(0, Math.round(rect.y)), height - 1);
  const w = Math.min(Math.max(1, Math.round(rect.width)), width - x);
  const h = Math.min(Math.max(1, Math.round(rect.height)), height - y);
  return { x, y, width: w, height: h };
}

/** Bounding box of a width×height image rotated by `degrees`. Right angles are exact. */
export function rotatedBounds(width: number, height: number, degrees: number): Size {
  const d = ((degrees % 360) + 360) % 360;
  if (d === 0 || d === 180) return { width, height };
  if (d === 90 || d === 270) return { width: height, height: width };
  const r = (d * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  return { width: Math.round(width * cos + height * sin), height: Math.round(width * sin + height * cos) };
}

/** Output size after applying operations in order. */
export function sizeAfterOps(width: number, height: number, ops: readonly ImageOperation[]): Size {
  let size: Size = { width, height };
  for (const op of ops) {
    switch (op.type) {
      case 'crop': {
        const r = clampRect(op.rect, size.width, size.height);
        size = { width: r.width, height: r.height };
        break;
      }
      case 'rotate':
        size = rotatedBounds(size.width, size.height, op.degrees);
        break;
      case 'resize':
        size = { width: Math.max(1, Math.round(op.width)), height: Math.max(1, Math.round(op.height)) };
        break;
      case 'flip':
      case 'mask':
        break;
    }
  }
  return size;
}

export interface ResizeRequest {
  mode: 'pixels' | 'percent';
  width?: number;
  height?: number;
  percent?: number;
  lockAspect: boolean;
}

/** Resolves a resize request to whole-pixel dimensions (at least 1×1). */
export function resolveResize(source: Size, req: ResizeRequest): Size {
  const ratio = source.width / source.height;
  if (req.mode === 'percent') {
    const p = (req.percent ?? 100) / 100;
    return { width: Math.max(1, Math.round(source.width * p)), height: Math.max(1, Math.round(source.height * p)) };
  }
  let width = req.width && req.width > 0 ? req.width : undefined;
  let height = req.height && req.height > 0 ? req.height : undefined;
  if (req.lockAspect) {
    if (width && !height) height = width / ratio;
    else if (height && !width) width = height * ratio;
    else if (width && height) height = width / ratio;
  }
  return { width: Math.max(1, Math.round(width ?? source.width)), height: Math.max(1, Math.round(height ?? source.height)) };
}

/** Fits a size inside a box while keeping its aspect ratio (never upscales). */
export function fitWithin(size: Size, maxWidth: number, maxHeight: number): Size {
  const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

export function scaleRect(rect: Rect, factor: number): Rect {
  return { x: rect.x * factor, y: rect.y * factor, width: rect.width * factor, height: rect.height * factor };
}

/**
 * Largest rectangle with the given aspect ratio (width / height) centred inside the image.
 * Used when switching the cropper to a fixed aspect ratio.
 */
export function centeredAspectRect(size: Size, aspect: number): Rect {
  let width = size.width;
  let height = width / aspect;
  if (height > size.height) {
    height = size.height;
    width = height * aspect;
  }
  return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
}

/** Rounds a value to the nearest even integer (≥ 2). Needed for yuv420p video. */
export function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** Rounds down to an even integer (≥ 2), so the result never exceeds the input. */
export function floorEven(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2);
}
