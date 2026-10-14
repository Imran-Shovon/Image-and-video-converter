import { useState } from 'react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import type { EnginePreference } from '@/lib/video-processing/engine';
import type { VideoJob } from '@/lib/video-processing/types';
import { remuxContainer } from '../containers';
import { Segmented } from '@/components/ui/primitives';
import { DEFAULT_VIDEO_ENCODE, VideoEncodeFields, buildEncodeJob, type VideoEncodeSettings } from '../VideoFields';
import { SourcePreview, VideoToolShell } from '../VideoToolShell';
import { TrimBar } from '../TrimBar';
import type { VideoItem } from '../useVideoQueue';

interface Settings extends VideoEncodeSettings {
  mode: 'fast' | 'precise';
  engine: EnginePreference;
}

const DEFAULTS: Settings = { ...DEFAULT_VIDEO_ENCODE, mode: 'precise', engine: 'ffmpeg' };

interface Range {
  id: string;
  start: number;
  end: number;
}

function TrimEditor({ item, range, setRange, onGenerate }: { item: VideoItem; range: Range; setRange: (r: Range) => void; onGenerate: () => void }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const duration = item.probe?.durationSec ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <SourcePreview item={item} onGenerate={onGenerate} videoRef={setVideo} />
      {duration > 0 && (
        <TrimBar duration={duration} start={range.start} end={range.end} onChange={(start, end) => setRange({ id: item.id, start, end })} video={video} fps={item.probe?.video?.fps ?? null} />
      )}
    </div>
  );
}

export default function TrimVideoPage() {
  const [s, update] = usePersistentSettings('video-trim', DEFAULTS);
  // The range belongs to one file; a new file starts with the whole video selected.
  const [stored, setRange] = useState<Range | null>(null);
  const rangeFor = (item: VideoItem): Range => (stored?.id === item.id ? stored : { id: item.id, start: 0, end: item.probe?.durationSec ?? 0 });

  const buildJob = (item: VideoItem): VideoJob => {
    const { start, end } = rangeFor(item);
    const r = { start, end };
    if (s.mode === 'fast') {
      const container = remuxContainer(item, item.probe!)!;
      return { type: 'remux', container, trim: r };
    }
    return buildEncodeJob(s, { trim: r });
  };

  return (
    <VideoToolShell
      tool={toolById('video-trim')!}
      operation="trimmed"
      needsPreview
      actionLabel="Trim video"
      engine={s.engine}
      onEngineChange={s.mode === 'precise' ? (engine) => update({ engine }) : undefined}
      buildJob={buildJob}
      itemError={(item) => {
        if (!item.probe?.durationSec) return 'This video has no known duration, so it can’t be trimmed.';
        if (s.mode === 'fast' && !remuxContainer(item, item.probe)) return 'Fast trim isn’t possible for this file’s codecs. Use precise mode.';
        return null;
      }}
      editor={(item, queue) => <TrimEditor item={item} range={rangeFor(item)} setRange={setRange} onGenerate={() => queue.ensurePreview(item.id)} />}
      settings={(item) => (
        <div className="flex flex-col gap-5">
          <Segmented<Settings['mode']>
            label="Trim mode"
            value={s.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: 'fast', label: 'Fast (lossless)' },
              { value: 'precise', label: 'Precise' },
            ]}
            hint={
              s.mode === 'fast'
                ? 'Copies the streams instantly without quality loss. Cut points snap to the nearest keyframe, so they may shift slightly.'
                : 'Re-encodes for frame-accurate cuts. Slower.'
            }
          />
          {s.mode === 'precise' && <VideoEncodeFields value={s} onChange={update} probe={item?.probe} />}
        </div>
      )}
    />
  );
}
