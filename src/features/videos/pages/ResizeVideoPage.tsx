import { ArrowLeftRight, ArrowUpDown, RotateCcw, RotateCw } from 'lucide-react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import type { EnginePreference } from '@/lib/video-processing/engine';
import type { Rotation } from '@/lib/video-processing/types';
import { Button } from '@/components/ui/primitives';
import { DEFAULT_VIDEO_ENCODE, ResolutionSelect, VideoEncodeFields, buildEncodeJob, outputSize, scaleForResolution, type ResolutionChoice, type VideoEncodeSettings } from '../VideoFields';
import { VideoToolShell } from '../VideoToolShell';

interface Settings extends VideoEncodeSettings {
  resolution: ResolutionChoice;
  rotate: Rotation;
  flipH: boolean;
  flipV: boolean;
  engine: EnginePreference;
}

const DEFAULTS: Settings = { ...DEFAULT_VIDEO_ENCODE, resolution: 'original', rotate: 0, flipH: false, flipV: false, engine: 'auto' };

function transformFor(s: Settings, video: { width: number; height: number }) {
  const swapped = s.rotate === 90 || s.rotate === 270;
  const rotated = swapped ? { width: video.height, height: video.width } : video;
  return { rotate: s.rotate, flipH: s.flipH, flipV: s.flipV, scale: scaleForResolution(s.resolution, rotated) };
}

export default function ResizeVideoPage() {
  const [s, update] = usePersistentSettings('video-resize', DEFAULTS);
  const nothingToDo = s.resolution === 'original' && s.rotate === 0 && !s.flipH && !s.flipV;
  return (
    <VideoToolShell
      tool={toolById('video-resize')!}
      operation="resized"
      multiple
      actionLabel="Apply"
      engine={s.engine}
      onEngineChange={(engine) => update({ engine })}
      settingsError={nothingToDo ? 'Choose a new resolution, a rotation or a flip.' : null}
      buildJob={(item) => buildEncodeJob(s, transformFor(s, item.probe!.video!))}
      settings={(item) => {
        const v = item?.probe?.video;
        const out = item?.probe && v ? outputSize(item.probe, transformFor(s, v)) : null;
        return (
          <div className="flex flex-col gap-5">
            <ResolutionSelect value={s.resolution} onChange={(resolution) => update({ resolution })} frame={v ?? undefined} />
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Rotate & flip</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => update({ rotate: ((s.rotate + 270) % 360) as Rotation })} icon={<RotateCcw className="size-4" aria-hidden />} aria-label="Rotate left 90°" />
                <Button size="sm" onClick={() => update({ rotate: ((s.rotate + 90) % 360) as Rotation })} icon={<RotateCw className="size-4" aria-hidden />} aria-label="Rotate right 90°" />
                <Button size="sm" aria-pressed={s.flipH} variant={s.flipH ? 'primary' : 'secondary'} onClick={() => update({ flipH: !s.flipH })} icon={<ArrowLeftRight className="size-4" aria-hidden />}>
                  Flip H
                </Button>
                <Button size="sm" aria-pressed={s.flipV} variant={s.flipV ? 'primary' : 'secondary'} onClick={() => update({ flipV: !s.flipV })} icon={<ArrowUpDown className="size-4" aria-hidden />}>
                  Flip V
                </Button>
              </div>
              <p className="text-xs text-muted">Rotation: {s.rotate}°</p>
            </div>
            {out && (
              <p className="text-sm text-muted" data-testid="output-dimensions">
                Output: <strong className="text-text">{out.width} × {out.height}</strong>
              </p>
            )}
            <VideoEncodeFields value={s} onChange={update} probe={item?.probe} />
          </div>
        );
      }}
    />
  );
}
