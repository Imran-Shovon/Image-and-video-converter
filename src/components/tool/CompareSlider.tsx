import { useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button, cx } from '@/components/ui/primitives';

/**
 * Before/after comparison (spec §A2). The divider is a native range input, so it works with keyboard,
 * touch and screen readers. "100%" shows actual pixels for judging compression artifacts.
 */
export function CompareSlider({ beforeUrl, afterUrl, width, height }: { beforeUrl: string; afterUrl: string; width: number; height: number }) {
  const [position, setPosition] = useState(50);
  const [actualSize, setActualSize] = useState(false);

  const layers = (
    <>
      {/* Each side is clipped to its half so transparent areas show the checkerboard, not the other image. */}
      <img
        src={beforeUrl}
        alt="Original"
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />
      <img
        src={afterUrl}
        alt="Processed"
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: `${position}%` }} aria-hidden>
        <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-black shadow">
          ⇆
        </div>
      </div>
      <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Original</span>
      <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Processed</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label="Comparison divider: left shows original, right shows processed"
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Drag the divider (or use arrow keys) to compare.</p>
        <Button size="sm" variant="ghost" onClick={() => setActualSize((v) => !v)} icon={actualSize ? <ZoomOut className="size-4" aria-hidden /> : <ZoomIn className="size-4" aria-hidden />} aria-pressed={actualSize}>
          {actualSize ? 'Fit' : '100%'}
        </Button>
      </div>
      {actualSize ? (
        <div className="checkerboard max-h-[70vh] overflow-auto rounded-lg border border-border focus-within:outline-3 focus-within:outline-accent">
          <div className="relative" style={{ width, height }}>
            {layers}
          </div>
        </div>
      ) : (
        <div
          className={cx('checkerboard relative w-full overflow-hidden rounded-lg border border-border focus-within:outline-3 focus-within:outline-accent')}
          style={{ aspectRatio: `${width} / ${height}`, maxHeight: '70vh' }}
        >
          {layers}
        </div>
      )}
    </div>
  );
}
