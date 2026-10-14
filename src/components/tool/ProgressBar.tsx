import { useEffect, useRef, useState } from 'react';
import { cx } from '@/components/ui/primitives';

/** Real progress only (spec §8). `fraction === null` renders an indeterminate bar, never a timed fake. */
export function ProgressBar({ fraction, label, className }: { fraction: number | null; label?: string; className?: string }) {
  const percent = fraction === null ? null : Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  const [announced, setAnnounced] = useState('');
  const lastStep = useRef(-1);

  // Announce to screen readers in 10% steps so the live region isn't flooded.
  useEffect(() => {
    const step = percent === null ? -2 : Math.floor(percent / 10);
    if (step === lastStep.current) return;
    lastStep.current = step;
    setAnnounced(percent === null ? `${label ?? 'Working'}…` : `${label ?? 'Progress'} ${percent}%`);
  }, [percent, label]);

  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate text-muted">{label ?? 'Working…'}</span>
        {percent !== null && <span className="tabular-nums font-medium">{percent}%</span>}
      </div>
      <div
        role="progressbar"
        aria-label={label ?? 'Progress'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      >
        {percent === null ? (
          <div className="progress-indeterminate h-full w-2/5 rounded-full bg-accent" />
        ) : (
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${percent}%` }} />
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        {announced}
      </span>
    </div>
  );
}
