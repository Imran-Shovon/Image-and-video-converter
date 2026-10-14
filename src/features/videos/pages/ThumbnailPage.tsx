import { useState } from 'react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { imageEngine } from '@/lib/image-processing/engine';
import { FORMATS } from '@/lib/media/formats';
import { formatDuration } from '@/lib/media/sizes';
import type { VideoJobResult } from '@/lib/video-processing/types';
import { Select, Slider } from '@/components/ui/primitives';
import { SourcePreview, VideoToolShell } from '../VideoToolShell';
import { SeekBar, useVideoTime } from '../TrimBar';
import type { VideoItem } from '../useVideoQueue';

type ThumbFormat = 'jpeg' | 'png' | 'webp';

interface Settings {
  format: ThumbFormat;
  quality: number;
}

const DEFAULTS: Settings = { format: 'jpeg', quality: 90 };

function FramePicker({ item, onVideo, onGenerate }: { item: VideoItem; onVideo: (v: HTMLVideoElement | null) => void; onGenerate: () => void }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const time = useVideoTime(video);
  return (
    <div className="flex flex-col gap-3">
      <SourcePreview
        item={item}
        onGenerate={onGenerate}
        videoRef={(el) => {
          setVideo(el);
          onVideo(el);
        }}
      />
      {video && <SeekBar video={video} duration={item.probe?.durationSec ?? 0} fps={item.probe?.video?.fps ?? null} />}
      <p className="text-sm text-muted">
        Pause on the frame you want, then save it. Selected time: <strong className="font-mono text-text">{formatDuration(time, true)}</strong>
      </p>
    </div>
  );
}

export default function ThumbnailPage() {
  const [s, update] = usePersistentSettings('video-thumbnail', DEFAULTS);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  // FFmpeg extracts the exact frame as PNG; the image engine then encodes the chosen format.
  const postProcess = async (result: VideoJobResult, signal: AbortSignal): Promise<VideoJobResult> => {
    if (s.format === 'png') return result;
    const encoded = await imageEngine.process(
      { file: result.blob, ops: [], encode: { format: s.format, quality: s.quality, pngMode: 'lossless', colors: 256, background: '#000000' } },
      { signal },
    );
    return { ...result, blob: encoded.blob, bytes: encoded.bytes, mime: encoded.mime, filenameExt: s.format === 'jpeg' ? 'jpg' : s.format, probe: null };
  };

  return (
    <VideoToolShell
      tool={toolById('video-thumbnail')!}
      operation="frame"
      needsPreview
      actionLabel="Save frame"
      resultKind="image"
      postProcess={postProcess}
      buildJob={(item) => {
        const max = Math.max(0, (item.probe?.durationSec ?? 0) - 0.001);
        return { type: 'thumbnail', time: Math.min(video?.currentTime ?? 0, max) };
      }}
      editor={(item, queue) => <FramePicker item={item} onVideo={setVideo} onGenerate={() => queue.ensurePreview(item.id)} />}
      settings={() => (
        <div className="flex flex-col gap-5">
          <Select<ThumbFormat>
            label="Image format"
            value={s.format}
            onChange={(format) => update({ format })}
            options={(['jpeg', 'png', 'webp'] as const).map((f) => ({ value: f, label: FORMATS[f].label }))}
          />
          {s.format !== 'png' && <Slider label="Quality" value={s.quality} min={1} max={100} onChange={(quality) => update({ quality })} />}
          <p className="text-xs text-muted">The frame is saved at the video’s full resolution.</p>
        </div>
      )}
    />
  );
}
