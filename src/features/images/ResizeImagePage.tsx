import { ArrowLeftRight, ArrowUpDown, Lock, LockOpen, RotateCcw, RotateCw } from 'lucide-react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { resolveResize, rotatedBounds } from '@/lib/image-processing/geometry';
import type { ImageOperation } from '@/lib/image-processing/types';
import { Button, NumberInput, Segmented, Slider } from '@/components/ui/primitives';
import { DEFAULT_ENCODE, EncodeFields, toEncodeSettings, transparencyWarning, type EncodeFormSettings } from './EncodeFields';
import { ImageToolShell } from './ImageToolShell';

interface ResizeSettings extends EncodeFormSettings {
  mode: 'pixels' | 'percent';
  width: number;
  height: number;
  percent: number;
  lockAspect: boolean;
  rotate: number;
  flipH: boolean;
  flipV: boolean;
}

const DEFAULTS: ResizeSettings = { ...DEFAULT_ENCODE, mode: 'percent', width: 1920, height: 0, percent: 50, lockAspect: true, rotate: 0, flipH: false, flipV: false };

export function resizeOps(s: ResizeSettings, source: { width: number; height: number }): ImageOperation[] {
  const ops: ImageOperation[] = [];
  if (s.rotate % 360 !== 0) ops.push({ type: 'rotate', degrees: s.rotate, background: s.background });
  if (s.flipH || s.flipV) ops.push({ type: 'flip', horizontal: s.flipH, vertical: s.flipV });
  const rotated = rotatedBounds(source.width, source.height, s.rotate);
  const size = resolveResize(rotated, {
    mode: s.mode,
    percent: s.percent,
    width: s.width || undefined,
    height: s.lockAspect && s.width ? undefined : s.height || undefined,
    lockAspect: s.lockAspect,
  });
  if (size.width !== rotated.width || size.height !== rotated.height) ops.push({ type: 'resize', width: size.width, height: size.height });
  return ops;
}

export default function ResizeImagePage() {
  const [s, update] = usePersistentSettings('image-resize', DEFAULTS);
  const settingsError =
    s.mode === 'percent' ? (s.percent > 0 && s.percent <= 400 ? null : 'Percentage must be between 1 and 400.') : s.width > 0 || s.height > 0 ? null : 'Enter a width or a height.';

  return (
    <ImageToolShell
      tool={toolById('image-resize')!}
      operation="resized"
      multiple
      actionLabel="Resize"
      settingsError={settingsError}
      warnings={(item) => transparencyWarning(s, item)}
      settings={(probe) => {
        const rotated = probe ? rotatedBounds(probe.width, probe.height, s.rotate) : null;
        const preview = rotated ? resolveResize(rotated, { mode: s.mode, percent: s.percent, width: s.width || undefined, height: s.lockAspect && s.width ? undefined : s.height || undefined, lockAspect: s.lockAspect }) : null;
        return (
          <div className="flex flex-col gap-5">
            <Segmented<'pixels' | 'percent'>
              label="Resize by"
              value={s.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: 'percent', label: 'Percentage' },
                { value: 'pixels', label: 'Pixels' },
              ]}
            />
            {s.mode === 'percent' ? (
              <Slider label="Scale" value={s.percent} min={1} max={200} onChange={(percent) => update({ percent })} format={(v) => `${v}%`} />
            ) : (
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <NumberInput label="Width" suffix="px" value={s.width || ''} min={1} onChange={(v) => update({ width: v === '' ? 0 : Math.round(v) })} />
                <Button
                  variant="ghost"
                  aria-pressed={s.lockAspect}
                  aria-label={s.lockAspect ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
                  onClick={() => update({ lockAspect: !s.lockAspect })}
                  icon={s.lockAspect ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
                />
                <NumberInput
                  label="Height"
                  suffix="px"
                  value={s.lockAspect && s.width ? (preview?.height ?? '') : s.height || ''}
                  min={1}
                  disabled={s.lockAspect && !!s.width}
                  onChange={(v) => update({ height: v === '' ? 0 : Math.round(v) })}
                />
              </div>
            )}
            {preview && (
              <p className="text-sm text-muted" data-testid="resize-preview">
                Output: <strong className="text-text">{preview.width} × {preview.height} px</strong>
                {s.mode === 'pixels' && s.lockAspect && ' (aspect ratio kept)'}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Rotate & flip</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => update({ rotate: (s.rotate + 270) % 360 })} icon={<RotateCcw className="size-4" aria-hidden />} aria-label="Rotate left 90°" />
                <Button size="sm" onClick={() => update({ rotate: (s.rotate + 90) % 360 })} icon={<RotateCw className="size-4" aria-hidden />} aria-label="Rotate right 90°" />
                <Button size="sm" aria-pressed={s.flipH} variant={s.flipH ? 'primary' : 'secondary'} onClick={() => update({ flipH: !s.flipH })} icon={<ArrowLeftRight className="size-4" aria-hidden />}>
                  Flip H
                </Button>
                <Button size="sm" aria-pressed={s.flipV} variant={s.flipV ? 'primary' : 'secondary'} onClick={() => update({ flipV: !s.flipV })} icon={<ArrowUpDown className="size-4" aria-hidden />}>
                  Flip V
                </Button>
              </div>
              <p className="text-xs text-muted">Rotation: {s.rotate}°</p>
            </div>
            <EncodeFields value={s} onChange={update} probe={probe} />
          </div>
        );
      }}
      buildJob={(item) => ({ file: item.file, ops: resizeOps(s, item.probe!), encode: toEncodeSettings(s, item.probe!) })}
    />
  );
}
