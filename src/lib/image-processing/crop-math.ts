// Pure crop-selection maths for the interactive cropper (shared by image and video croppers).
import type { Rect } from './types';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function moveRect(start: Rect, dx: number, dy: number, W: number, H: number): Rect {
  return { ...start, x: clamp(start.x + dx, 0, W - start.width), y: clamp(start.y + dy, 0, H - start.height) };
}

/** Resizes a selection by dragging a handle, keeping it inside W×H and (optionally) locked to `aspect` (w/h). */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, aspect: number | null, W: number, H: number, min = 1): Rect {
  const left0 = start.x;
  const top0 = start.y;
  const right0 = start.x + start.width;
  const bottom0 = start.y + start.height;
  const hasW = handle.includes('w');
  const hasE = handle.includes('e');
  const hasN = handle.includes('n');
  const hasS = handle.includes('s');

  if (!aspect) {
    const left = hasW ? clamp(left0 + dx, 0, right0 - min) : left0;
    const right = hasE ? clamp(right0 + dx, left0 + min, W) : right0;
    const top = hasN ? clamp(top0 + dy, 0, bottom0 - min) : top0;
    const bottom = hasS ? clamp(bottom0 + dy, top0 + min, H) : bottom0;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  const isCorner = (hasW || hasE) && (hasN || hasS);
  if (isCorner) {
    const ax = hasE ? left0 : right0; // anchor = opposite corner
    const ay = hasS ? top0 : bottom0;
    const ex = (hasE ? right0 : left0) + dx;
    const ey = (hasS ? bottom0 : top0) + dy;
    let w = Math.max(min, Math.abs(ex - ax));
    let h = Math.max(min, Math.abs(ey - ay));
    if (w / h > aspect) w = h * aspect;
    else h = w / aspect;
    const maxW = hasE ? W - ax : ax;
    const maxH = hasS ? H - ay : ay;
    if (w > maxW) {
      w = maxW;
      h = w / aspect;
    }
    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }
    return { x: hasE ? ax : ax - w, y: hasS ? ay : ay - h, width: w, height: h };
  }

  if (hasE || hasW) {
    const ax = hasE ? left0 : right0;
    const cy = top0 + start.height / 2;
    let w = Math.max(min, hasE ? right0 + dx - ax : ax - (left0 + dx));
    w = Math.min(w, hasE ? W - ax : ax, H * aspect);
    const h = w / aspect;
    return { x: hasE ? ax : ax - w, y: clamp(cy - h / 2, 0, H - h), width: w, height: h };
  }

  const ay = hasS ? top0 : bottom0;
  const cx = left0 + start.width / 2;
  let h = Math.max(min, hasS ? bottom0 + dy - ay : ay - (top0 + dy));
  h = Math.min(h, hasS ? H - ay : ay, W / aspect);
  const w = h * aspect;
  return { x: clamp(cx - w / 2, 0, W - w), y: hasS ? ay : ay - h, width: w, height: h };
}

/** Scales a selection around its centre (pinch gesture), clamped to the image. */
export function scaleRectAround(start: Rect, factor: number, W: number, H: number, min = 1): Rect {
  const aspect = start.width / start.height;
  let w = clamp(start.width * factor, min, W);
  let h = w / aspect;
  if (h > H) {
    h = H;
    w = h * aspect;
  }
  const cx = start.x + start.width / 2;
  const cy = start.y + start.height / 2;
  return { x: clamp(cx - w / 2, 0, W - w), y: clamp(cy - h / 2, 0, H - h), width: w, height: h };
}

/** Rounds to whole pixels inside the image; used for numeric inputs and for the final crop. */
export function roundRect(r: Rect, W: number, H: number): Rect {
  const x = clamp(Math.round(r.x), 0, W - 1);
  const y = clamp(Math.round(r.y), 0, H - 1);
  return { x, y, width: clamp(Math.round(r.width), 1, W - x), height: clamp(Math.round(r.height), 1, H - y) };
}
