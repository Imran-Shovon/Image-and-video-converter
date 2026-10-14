import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { videoOutputCapability } from '@/lib/media/capabilities';
import type { EnginePreference } from '@/lib/video-processing/engine';
import { canRemux } from '@/lib/video-processing/args';
import type { RemuxJob, VideoJob } from '@/lib/video-processing/types';
import { Switch } from '@/components/ui/primitives';
import { DEFAULT_VIDEO_ENCODE, ResolutionSelect, VideoEncodeFields, buildEncodeJob, scaleForResolution, type ResolutionChoice, type VideoEncodeSettings } from '../VideoFields';
import { VideoToolShell } from '../VideoToolShell';
import type { VideoItem } from '../useVideoQueue';

interface Settings extends VideoEncodeSettings {
  remux: boolean;
  resolution: ResolutionChoice;
  engine: EnginePreference;
}

const DEFAULTS: Settings = { ...DEFAULT_VIDEO_ENCODE, remux: true, resolution: 'original', engine: 'auto' };

const containerOf = (s: Settings) => videoOutputCapability(s.output).container as RemuxJob['container'];

export function remuxPossible(item: VideoItem | undefined, s: Settings): boolean {
  return !!item?.probe && canRemux(item.probe, containerOf(s), s.removeAudio);
}

export default function ConvertVideoPage() {
  const [s, update] = usePersistentSettings('video-convert', DEFAULTS);

  const buildJob = (item: VideoItem): VideoJob => {
    if (s.remux && s.resolution === 'original' && remuxPossible(item, s)) {
      return { type: 'remux', container: containerOf(s), removeAudio: s.removeAudio };
    }
    const v = item.probe!.video!;
    return buildEncodeJob(s, { scale: scaleForResolution(s.resolution, v) });
  };

  return (
    <VideoToolShell
      tool={toolById('video-convert')!}
      operation="converted"
      multiple
      extraAccept={['gif']}
      actionLabel="Convert"
      engine={s.engine}
      onEngineChange={(engine) => update({ engine })}
      buildJob={buildJob}
      settings={(item) => {
        const canCopy = remuxPossible(item, s);
        const copying = canCopy && s.remux && s.resolution === 'original';
        return (
          <div className="flex flex-col gap-5">
            <VideoEncodeFields value={s} onChange={update} probe={item?.probe} showQuality={!copying} />
            {canCopy && (
              <Switch
                label="Change container only (fast, lossless)"
                checked={s.remux}
                onChange={(remux) => update({ remux })}
                hint="The streams already fit this format, so they can be copied without re-encoding."
              />
            )}
            {!copying && <ResolutionSelect value={s.resolution} onChange={(resolution) => update({ resolution })} frame={item?.probe?.video ?? undefined} />}
            <p className="text-xs text-muted">
              The first video and audio track are kept. Subtitles, chapters and metadata are removed.
            </p>
          </div>
        );
      }}
    />
  );
}
