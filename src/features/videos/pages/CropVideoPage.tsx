import { useState } from 'react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { ASPECTS, aspectRatio, type AspectChoice } from '@/lib/image-processing/aspects';
import { roundRect } from '@/lib/image-processing/crop-math';
import { centeredAspectRect } from '@/lib/image-processing/geometry';
import type { Rect } from '@/lib/image-processing/types';
import { snapCrop } from '@/lib/video-processing/args';
import type { EnginePreference } from '@/lib/video-processing/engine';
import { NumberInput, Select } from '@/components/ui/primitives';
import { Cropper } from '@/components/tool/Cropper';
import { DEFAULT_VIDEO_ENCODE, ResolutionSelect, VideoEncodeFields, buildEncodeJob, scaleForResolution, type ResolutionChoice, type VideoEncodeSettings } from '../VideoFields';
import { SourcePreview, VideoToolShell } from '../VideoToolShell';
import { SeekBar } from '../TrimBar';
import type { VideoItem } from '../useVideoQueue';

interface Settings extends VideoEncodeSettings {
  aspect: AspectChoice;
  resolution: ResolutionChoice;
  engine: EnginePreference;
}

const DEFAULTS: Settings = { ...DEFAULT_VIDEO_ENCODE, aspect: 'free', resolution: 'original', engine: 'auto' };

function CropEditor({ item, rect, onChange, ratio, onGenerate }: { item: VideoItem; rect: Rect; onChange: (r: Rect) => void; ratio: number | null; onGenerate: () => void }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const v = item.probe!.video!;
  const ready = item.previewState === 'playable' || item.previewState === 'proxy';
  if (!ready) return <SourcePreview item={item} onGenerate={onGenerate} />;
  return (
    <div className="flex flex-col gap-3">
      <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-lg bg-black">
        <Cropper width={v.width} height={v.height} value={rect} onChange={onChange} aspect={ratio} label="Video crop area">
          <video ref={setVideo} src={item.previewUrl} playsInline muted preload="auto" className="size-full" aria-label="Video being cropped" />
        </Cropper>
      </div>
      <SeekBar video={video} duration={item.probe?.durationSec ?? 0} fps={v.fps} />
    </div>
  );
}

export default function CropVideoPage() {
  const [s, update] = usePersistentSettings('video-crop', DEFAULTS);
  // The selection belongs to one file + aspect ratio; it resets to the default when either changes.
  const [stored, setStored] = useState<{ key: string; rect: Rect } | null>(null);

  const ratioFor = (item: VideoItem) => aspectRatio(s.aspect, item.probe!.video!);
  const keyFor = (item: VideoItem) => `${item.id}|${s.aspect}`;
  const rectFor = (item: VideoItem): Rect => {
    if (stored?.key === keyFor(item)) return stored.rect;
    const v = item.probe!.video!;
    const ratio = ratioFor(item);
    return ratio ? centeredAspectRect(v, ratio) : { x: 0, y: 0, width: v.width, height: v.height };
  };
  const setRectFor = (item: VideoItem, rect: Rect) => setStored({ key: keyFor(item), rect });
  const cropFor = (item: VideoItem) => {
    const v = item.probe!.video!;
    return snapCrop(roundRect(rectFor(item), v.width, v.height), v.width, v.height);
  };

  return (
    <VideoToolShell
      tool={toolById('video-crop')!}
      operation="cropped"
      needsPreview
      actionLabel="Crop video"
      engine={s.engine}
      onEngineChange={(engine) => update({ engine })}
      buildJob={(item) => {
        const crop = cropFor(item);
        return buildEncodeJob(s, { crop, scale: scaleForResolution(s.resolution, crop) });
      }}
      editor={(item, queue) => (
        <CropEditor item={item} rect={rectFor(item)} onChange={(r) => setRectFor(item, r)} ratio={ratioFor(item)} onGenerate={() => queue.ensurePreview(item.id)} />
      )}
      settings={(item) => {
        const v = item?.probe?.video;
        const crop = item && v ? cropFor(item) : null;
        const setField = (key: keyof Rect, value: number | '') => {
          if (!item || !v || value === '') return;
          setRectFor(item, roundRect({ ...rectFor(item), [key]: value }, v.width, v.height));
        };
        return (
          <div className="flex flex-col gap-5">
            <Select<AspectChoice> label="Aspect ratio" value={s.aspect} onChange={(aspect) => update({ aspect })} options={ASPECTS.map((a) => ({ value: a.value, label: a.label }))} />
            {crop && v && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="X" suffix="px" value={crop.x} min={0} onChange={(val) => setField('x', val)} />
                  <NumberInput label="Y" suffix="px" value={crop.y} min={0} onChange={(val) => setField('y', val)} />
                  <NumberInput label="Width" suffix="px" value={crop.width} min={2} onChange={(val) => setField('width', val)} />
                  <NumberInput label="Height" suffix="px" value={crop.height} min={2} onChange={(val) => setField('height', val)} />
                </div>
                <p className="text-xs text-muted" data-testid="crop-summary">
                  Crop {crop.width} × {crop.height} at ({crop.x}, {crop.y}) of {v.width} × {v.height}. Values snap to even numbers, which H.264 requires.
                </p>
              </>
            )}
            <ResolutionSelect value={s.resolution} onChange={(resolution) => update({ resolution })} frame={crop ?? undefined} />
            <VideoEncodeFields value={s} onChange={update} probe={item?.probe} />
          </div>
        );
      }}
    />
  );
}
