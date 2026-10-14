import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { moveRect, resizeRect, scaleRectAround, type Handle } from '@/lib/image-processing/crop-math';
import type { Rect } from '@/lib/image-processing/types';

export interface CropperProps {
  /** Coordinate space of `value` — full-resolution source pixels. */
  width: number;
  height: number;
  value: Rect;
  onChange: (rect: Rect) => void;
  /** Locked aspect ratio (width / height) or null for freeform. */
  aspect: number | null;
  /** Media element that fills the box (img, canvas or video). */
  children: ReactNode;
  label?: string;
}

// Handle anchors as fractions of the selection box; each has a 44×44 px touch target centred on the anchor.
const HANDLES: { id: Handle; x: number; y: number; cursor: string }[] = [
  { id: 'nw', x: 0, y: 0, cursor: 'nwse-resize' },
  { id: 'n', x: 0.5, y: 0, cursor: 'ns-resize' },
  { id: 'ne', x: 1, y: 0, cursor: 'nesw-resize' },
  { id: 'e', x: 1, y: 0.5, cursor: 'ew-resize' },
  { id: 'se', x: 1, y: 1, cursor: 'nwse-resize' },
  { id: 's', x: 0.5, y: 1, cursor: 'ns-resize' },
  { id: 'sw', x: 0, y: 1, cursor: 'nesw-resize' },
  { id: 'w', x: 0, y: 0.5, cursor: 'ew-resize' },
];

/**
 * Interactive crop selection (spec §A3, §B3): mouse/touch drag, resize handles, two-finger pinch,
 * and keyboard (arrows move, Shift+arrows resize; hold Alt for 10× steps). The selection is kept in source pixels.
 */
export function Cropper({ width, height, value, onChange, aspect, children, label = 'Crop selection' }: CropperProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: Handle | 'move'; startX: number; startY: number; start: Rect } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; start: Rect } | null>(null);

  const scale = () => (boxRef.current ? boxRef.current.clientWidth / width : 1);

  const begin = (e: PointerEvent, mode: Handle | 'move') => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), start: value };
      drag.current = null;
    } else {
      drag.current = { mode, startX: e.clientX, startY: e.clientY, start: value };
    }
  };

  const move = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      onChange(scaleRectAround(pinch.current.start, distance / pinch.current.distance, width, height));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const s = scale();
    const dx = (e.clientX - d.startX) / s;
    const dy = (e.clientY - d.startY) / s;
    onChange(d.mode === 'move' ? moveRect(d.start, dx, dy, width, height) : resizeRect(d.start, d.mode, dx, dy, aspect, width, height));
  };

  const end = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const keys: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const dir = keys[e.key];
    if (!dir) return;
    e.preventDefault();
    // One step is one screen pixel (at least one source pixel), ×10 with Alt.
    const step = Math.max(1, Math.round(1 / scale())) * (e.altKey ? 10 : 1);
    const [dx, dy] = [dir[0] * step, dir[1] * step];
    if (e.shiftKey) {
      const handle: Handle = dx !== 0 ? 'e' : 's';
      onChange(resizeRect(value, handle, dx, dy, aspect, width, height));
    } else {
      onChange(moveRect(value, dx, dy, width, height));
    }
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;

  return (
    <div ref={boxRef} className="relative w-full touch-none select-none" style={{ aspectRatio: `${width} / ${height}` }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div className="absolute inset-0">{children}</div>
      {/* Darken everything outside the selection. */}
      <div
        className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
        style={{ left: pct(value.x, width), top: pct(value.y, height), width: pct(value.width, width), height: pct(value.height, height) }}
        aria-hidden
      >
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="border border-white/25" />
          ))}
        </div>
      </div>
      <div
        role="group"
        tabIndex={0}
        aria-roledescription="crop area"
        aria-label={`${label}: ${Math.round(value.width)} by ${Math.round(value.height)} pixels at ${Math.round(value.x)}, ${Math.round(value.y)}. Arrow keys move, Shift plus arrow keys resize, Alt for larger steps.`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => begin(e, 'move')}
        className="absolute cursor-move focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
        style={{ left: pct(value.x, width), top: pct(value.y, height), width: pct(value.width, width), height: pct(value.height, height) }}
        data-testid="crop-area"
      >
        {HANDLES.map((h) => (
          <span
            key={h.id}
            onPointerDown={(e) => begin(e, h.id)}
            className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
            style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%`, cursor: h.cursor }}
            aria-hidden
          >
            <span className="size-4 rounded-sm border-2 border-accent bg-white shadow" />
          </span>
        ))}
      </div>
    </div>
  );
}
