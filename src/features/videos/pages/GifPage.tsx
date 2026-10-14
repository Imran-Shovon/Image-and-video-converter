import { useState } from 'react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { getLimits } from '@/lib/media/limits';
import { Slider, Switch } from '@/components/ui/primitives';
import { SourcePreview, VideoToolShell } from '../VideoToolShell';
import { TrimBar } from '../TrimBar';
import type { VideoItem } from '../useVideoQueue';

interface Settings {
  fps: number;
  width: number;
  loop: boolean;
}

const DEFAULTS: Settings = { fps: 12, width: 480, loop: true };

interface Range {
  id: string;
  start: number;
  end: number;
}

function ClipPicker({ item, range, setRange, onGenerate }: { item: VideoItem; range: Range; setRange: (r: Range) => void; onGenerate: () => void }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const duration = item.probe?.durationSec ?? 0;
  const max = getLimits().gifSeconds;
  return (
    <div className="flex flex-col gap-4">
      <SourcePreview item={item} onGenerate={onGenerate} videoRef={setVideo} />
      {duration > 0 && (
        <TrimBar duration={duration} start={range.start} end={range.end} maxLength={max} onChange={(start, end) => setRange({ id: item.id, start, end })} video={video} fps={item.probe?.video?.fps ?? null} />
      )}
      <p className="text-xs text-muted">GIFs can be at most {max} seconds long on this device.</p>
    </div>
  );
}

export default function GifPage() {
  const [s, update] = usePersistentSettings('video-gif', DEFAULTS);
  // A new file starts with the first few seconds selected (within the GIF limit).
  const [stored, setRange] = useState<Range | null>(null);
  const rangeFor = (item: VideoItem): Range =>
    stored?.id === item.id ? stored : { id: item.id, start: 0, end: Math.min(item.probe?.durationSec ?? 0, getLimits().gifSeconds, 5) };
  return (
    <VideoToolShell
      tool={toolById('video-gif')!}
      operation="animation"
      needsPreview
      actionLabel="Create GIF"
      resultKind="image"
      buildJob={(item) => {
        const r = rangeFor(item);
        return { type: 'gif', start: r.start, duration: r.end - r.start, fps: s.fps, width: s.width, loop: s.loop };
      }}
      editor={(item, queue) => <ClipPicker item={item} range={rangeFor(item)} setRange={setRange} onGenerate={() => queue.ensurePreview(item.id)} />}
      itemError={(item) => (item.probe?.durationSec ? null : 'This video has no known duration.')}
      settings={(item) => {
        const v = item?.probe?.video;
        const maxWidth = v ? Math.min(960, v.width) : 960;
        return (
          <div className="flex flex-col gap-5">
            <Slider label="Frame rate" value={s.fps} min={5} max={30} onChange={(fps) => update({ fps })} format={(v) => `${v} fps`} hint="Higher frame rates are smoother but much larger." />
            <Slider label="Width" value={Math.min(s.width, maxWidth)} min={120} max={maxWidth} step={10} onChange={(width) => update({ width })} format={(v) => `${v}px`} />
            <Switch label="Loop forever" checked={s.loop} onChange={(loop) => update({ loop })} />
          </div>
        );
      }}
    />
  );
}
