import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { IMAGE_PRESETS, isLossyFormat, presetQuality, type ImagePresetId } from '@/lib/image-processing/presets';
import { parseSizeInput } from '@/lib/media/sizes';
import { NumberInput, Segmented, Switch } from '@/components/ui/primitives';
import { DEFAULT_ENCODE, EncodeFields, resolveFormat, toEncodeSettings, transparencyWarning, type EncodeFormSettings } from './EncodeFields';
import { ImageToolShell } from './ImageToolShell';

interface CompressSettings extends EncodeFormSettings {
  preset: ImagePresetId | 'custom';
  useTarget: boolean;
  targetValue: number;
  targetUnit: 'KB' | 'MB';
  allowDownscale: boolean;
}

const DEFAULTS: CompressSettings = { ...DEFAULT_ENCODE, format: 'same', preset: 'balanced', useTarget: false, targetValue: 500, targetUnit: 'KB', allowDownscale: false };

export default function CompressImagePage() {
  const [s, update] = usePersistentSettings('image-compress', DEFAULTS);
  const targetBytes = s.useTarget && s.targetValue > 0 ? parseSizeInput(s.targetValue, s.targetUnit) : undefined;
  const settingsError = s.useTarget && !(s.targetValue > 0) ? 'Enter a target size greater than zero.' : null;

  return (
    <ImageToolShell
      tool={toolById('image-compress')!}
      operation="compressed"
      multiple
      actionLabel="Compress"
      offerKeepOriginal
      settingsError={settingsError}
      warnings={(item) => transparencyWarning(s, item)}
      settings={(probe) => {
        const out = probe ? resolveFormat(s.format, probe) : 'jpeg';
        return (
          <div className="flex flex-col gap-5">
            <Segmented<CompressSettings['preset']>
              label="Preset"
              value={s.preset}
              onChange={(preset) => {
                if (preset === 'custom') return update({ preset });
                const p = IMAGE_PRESETS[preset];
                update({ preset, quality: presetQuality(preset, out), pngMode: p.pngMode, colors: p.colors });
              }}
              options={[
                { value: 'small', label: 'Low size', title: IMAGE_PRESETS.small.description },
                { value: 'balanced', label: 'Balanced', title: IMAGE_PRESETS.balanced.description },
                { value: 'high', label: 'High', title: IMAGE_PRESETS.high.description },
                { value: 'custom', label: 'Custom' },
              ]}
              hint={s.preset === 'custom' ? 'Choose your own settings below.' : IMAGE_PRESETS[s.preset].description}
            />
            <EncodeFields
              value={s.preset === 'custom' ? s : { ...s, quality: presetQuality(s.preset, out), pngMode: IMAGE_PRESETS[s.preset].pngMode, colors: IMAGE_PRESETS[s.preset].colors }}
              onChange={(patch) => update({ ...patch, ...(patch.quality !== undefined || patch.pngMode !== undefined || patch.colors !== undefined ? { preset: 'custom' as const } : {}) })}
              probe={probe}
              showQuality={!s.useTarget}
            />
            <Switch
              label="Target file size"
              checked={s.useTarget}
              onChange={(useTarget) => update({ useTarget })}
              hint={isLossyFormat(out) ? 'Searches for the best quality under the target.' : 'Lossless formats can only reach a target by downscaling.'}
            />
            {s.useTarget && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                  <NumberInput label="Target" value={s.targetValue} min={1} onChange={(v) => update({ targetValue: v === '' ? 0 : v })} invalid={!(s.targetValue > 0)} />
                  <Segmented<'KB' | 'MB'>
                    label="Unit"
                    value={s.targetUnit}
                    onChange={(targetUnit) => update({ targetUnit })}
                    options={[
                      { value: 'KB', label: 'KB' },
                      { value: 'MB', label: 'MB' },
                    ]}
                  />
                </div>
                <Switch label="Allow downscaling" checked={s.allowDownscale} onChange={(allowDownscale) => update({ allowDownscale })} hint="Reduce dimensions if quality alone can’t reach the target." />
                <p className="text-xs text-muted">Target sizes are best effort; the achieved size is always shown. 1 MB = 1,000 KB.</p>
              </div>
            )}
          </div>
        );
      }}
      buildJob={(item) => {
        const probe = item.probe!;
        const out = resolveFormat(s.format, probe);
        const effective = s.preset === 'custom' ? s : { ...s, quality: presetQuality(s.preset, out), pngMode: IMAGE_PRESETS[s.preset].pngMode, colors: IMAGE_PRESETS[s.preset].colors };
        return { file: item.file, ops: [], encode: { ...toEncodeSettings(effective, probe), targetBytes, allowDownscale: s.allowDownscale } };
      }}
    />
  );
}
