import { useEffect, useState } from 'react';
import { Slider as RSlider } from 'radix-ui';
import { Play, StepBack, StepForward } from 'lucide-react';
import { formatDuration, parseTimecode } from '@/lib/media/sizes';
import { Button, TextInput } from '@/components/ui/primitives';

/** Seeks a video element (kept outside components so props are not mutated in render scope). */
export function seekVideo(video: HTMLVideoElement | null, time: number) {
  if (video) video.currentTime = time;
}

export function useVideoTime(video: HTMLVideoElement | null) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!video) return;
    const update = () => setTime(video.currentTime);
    video.addEventListener('timeupdate', update);
    video.addEventListener('seeked', update);
    video.addEventListener('loadedmetadata', update);
    return () => {
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('timeupdate', update);
      video.removeEventListener('seeked', update);
    };
  }, [video]);
  return time;
}

function TimecodeField({ label, value, onCommit, max }: { label: string; value: number; onCommit: (v: number) => void; max: number }) {
  // The parent remounts this field (via key) when the value changes, which resets the draft text.
  const [text, setText] = useState(formatDuration(value, true));
  const [invalid, setInvalid] = useState(false);
  return (
    <div
      onBlur={() => {
        const parsed = parseTimecode(text);
        if (parsed === null || parsed > max) setInvalid(true);
        else onCommit(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLElement).blur();
      }}
    >
      <TextInput label={label} value={text} onChange={setText} invalid={invalid} hint={invalid ? 'Use m:ss.mmm within the video length' : undefined} />
    </div>
  );
}

/**
 * Two-handle trim range (spec §B4): drag or use arrow keys on each handle, type exact timecodes,
 * step frame by frame, and preview the selection.
 */
export function TrimBar({
  duration,
  start,
  end,
  onChange,
  video,
  fps,
  maxLength,
}: {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  video: HTMLVideoElement | null;
  fps: number | null;
  /** Optional maximum selection length in seconds (GIF). */
  maxLength?: number;
}) {
  const current = useVideoTime(video);
  const frame = fps && fps > 0 ? 1 / fps : 1 / 30;
  const seek = (t: number) => {
    seekVideo(video, Math.max(0, Math.min(duration, t)));
  };
  const set = (s: number, e: number, moved: 'start' | 'end') => {
    let ns = Math.max(0, Math.min(s, duration));
    let ne = Math.max(0, Math.min(e, duration));
    if (ne - ns < frame) {
      if (moved === 'start') ns = Math.max(0, ne - frame);
      else ne = Math.min(duration, ns + frame);
    }
    if (maxLength && ne - ns > maxLength) {
      if (moved === 'start') ne = ns + maxLength;
      else ns = ne - maxLength;
    }
    onChange(ns, ne);
  };

  const playSelection = () => {
    if (!video) return;
    seekVideo(video, start);
    void video.play();
    const stop = () => {
      if (video.currentTime >= end) {
        video.pause();
        video.removeEventListener('timeupdate', stop);
      }
    };
    video.addEventListener('timeupdate', stop);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="relative pt-2">
        <RSlider.Root
          className="relative flex h-11 w-full touch-none select-none items-center"
          value={[start, end]}
          min={0}
          max={duration}
          step={0.001}
          minStepsBetweenThumbs={1}
          onValueChange={([s, e]) => set(s ?? start, e ?? end, s !== start ? 'start' : 'end')}
          aria-label="Trim range"
        >
          <RSlider.Track className="relative h-3 grow rounded-full bg-surface-2">
            <RSlider.Range className="absolute h-full rounded-full bg-accent/70" />
          </RSlider.Track>
          {[0, 1].map((i) => (
            <RSlider.Thumb
              key={i}
              aria-label={i === 0 ? 'Trim start' : 'Trim end'}
              aria-valuetext={formatDuration(i === 0 ? start : end, true)}
              onFocus={() => seek(i === 0 ? start : end)}
              className="block h-8 w-3 rounded-sm border-2 border-accent bg-surface shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
            />
          ))}
        </RSlider.Root>
        <div className="pointer-events-none absolute top-1 h-11 w-0.5 bg-danger" style={{ left: `${(current / duration) * 100}%` }} aria-hidden />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => seek(current - frame)} icon={<StepBack className="size-4" aria-hidden />} aria-label="Previous frame" />
        <span className="min-w-28 text-center font-mono text-sm tabular-nums" aria-live="off">
          {formatDuration(current, true)}
        </span>
        <Button size="sm" onClick={() => seek(current + frame)} icon={<StepForward className="size-4" aria-hidden />} aria-label="Next frame" />
        <Button size="sm" onClick={() => set(current, end, 'start')}>
          Set start here
        </Button>
        <Button size="sm" onClick={() => set(start, current, 'end')}>
          Set end here
        </Button>
        <Button size="sm" variant="ghost" onClick={playSelection} icon={<Play className="size-4" aria-hidden />}>
          Play selection
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <TimecodeField key={`s${start}`} label="Start" value={start} max={duration} onCommit={(v) => set(v, end, 'start')} />
        <TimecodeField key={`e${end}`} label="End" value={end} max={duration} onCommit={(v) => set(start, v, 'end')} />
        <div className="flex flex-col justify-end gap-1 pb-2 text-sm">
          <span className="text-muted">Selection</span>
          <span className="font-semibold tabular-nums" data-testid="trim-length">
            {formatDuration(end - start, true)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Single-thumb seek bar for tools whose preview is covered by an overlay (crop) or that pick one frame (thumbnail). */
export function SeekBar({ video, duration, fps }: { video: HTMLVideoElement | null; duration: number; fps: number | null }) {
  const current = useVideoTime(video);
  const frame = fps && fps > 0 ? 1 / fps : 1 / 30;
  const seek = (t: number) => {
    seekVideo(video, Math.max(0, Math.min(duration, t)));
  };
  return (
    <div className="flex flex-col gap-2">
      <RSlider.Root className="relative flex h-11 w-full touch-none select-none items-center" value={[current]} min={0} max={duration} step={frame} onValueChange={([v]) => seek(v ?? 0)}>
        <RSlider.Track className="relative h-1.5 grow rounded-full bg-surface-2">
          <RSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RSlider.Track>
        <RSlider.Thumb aria-label="Video position" aria-valuetext={formatDuration(current, true)} className="block size-5 rounded-full border-2 border-accent bg-surface shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent" />
      </RSlider.Root>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => seek(current - frame)} icon={<StepBack className="size-4" aria-hidden />} aria-label="Previous frame" />
        <span className="min-w-28 text-center font-mono text-sm tabular-nums">{formatDuration(current, true)}</span>
        <Button size="sm" onClick={() => seek(current + frame)} icon={<StepForward className="size-4" aria-hidden />} aria-label="Next frame" />
      </div>
    </div>
  );
}
