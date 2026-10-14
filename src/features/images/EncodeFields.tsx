import { advertisedImageOutputs, imageOutputCapability } from '@/lib/media/capabilities';
import { FORMATS, type ImageFormatId } from '@/lib/media/formats';
import { isLossyFormat, supportsTransparency } from '@/lib/image-processing/presets';
import type { ImageEncodeSettings, ImageOutputFormat, ImageProbe, PngMode } from '@/lib/image-processing/types';
import { Field, Segmented, Select, Slider } from '@/components/ui/primitives';
import type { ImageItem } from './useImageQueue';

export type FormatChoice = ImageOutputFormat | 'same';

export interface EncodeFormSettings {
  format: FormatChoice;
  quality: number;
  pngMode: PngMode;
  colors: number;
  background: string;
}

export const DEFAULT_ENCODE: EncodeFormSettings = { format: 'same', quality: 82, pngMode: 'lossless', colors: 256, background: '#ffffff' };

const OUTPUTS = new Set<string>(['jpeg', 'png', 'webp', 'avif', 'gif', 'bmp']);

/** "Same as original" keeps the input format when it can be encoded, otherwise picks PNG (alpha) or JPEG. */
export function resolveFormat(choice: FormatChoice, probe: Pick<ImageProbe, 'format' | 'hasAlpha'>): ImageOutputFormat {
  if (choice !== 'same') return choice;
  if (OUTPUTS.has(probe.format)) return probe.format as ImageOutputFormat;
  return probe.hasAlpha ? 'png' : 'jpeg';
}

export function toEncodeSettings(s: EncodeFormSettings, probe: Pick<ImageProbe, 'format' | 'hasAlpha'>): ImageEncodeSettings {
  return { format: resolveFormat(s.format, probe), quality: s.quality, pngMode: s.pngMode, colors: s.colors, background: s.background };
}

export function transparencyWarning(s: EncodeFormSettings, item: ImageItem): string[] {
  if (!item.probe) return [];
  const out = resolveFormat(s.format, item.probe);
  const warnings: string[] = [];
  if (item.probe.hasAlpha && !supportsTransparency(out)) {
    warnings.push(`This image has transparent areas. ${FORMATS[out].label} has no transparency, so they will be filled with the background colour (${s.background}).`);
  }
  if (item.probe.hasAlpha && out === 'gif') warnings.push('GIF supports only fully transparent or fully opaque pixels; soft edges will look jagged.');
  if (item.probe.animated) warnings.push('This is an animated image. Only the first frame will be converted. To keep the animation, use Video → Convert.');
  return warnings;
}

export function EncodeFields({
  value,
  onChange,
  probe,
  allowSame = true,
  showQuality = true,
}: {
  value: EncodeFormSettings;
  onChange: (patch: Partial<EncodeFormSettings>) => void;
  probe: ImageProbe | undefined;
  allowSame?: boolean;
  showQuality?: boolean;
}) {
  const outputs = advertisedImageOutputs();
  const resolved: ImageOutputFormat = probe ? resolveFormat(value.format, probe) : value.format === 'same' ? 'jpeg' : value.format;
  const cap = imageOutputCapability(resolved);
  const sameLabel = probe ? `Same as original (${FORMATS[resolveFormat('same', probe) as ImageFormatId].label})` : 'Same as original';

  return (
    <div className="flex flex-col gap-5">
      <Select<FormatChoice>
        label="Output format"
        value={value.format}
        onChange={(format) => onChange({ format })}
        options={[...(allowSame ? [{ value: 'same' as const, label: sameLabel }] : []), ...outputs.map((o) => ({ value: o.format, label: FORMATS[o.format].label }))]}
        hint={cap.notes}
      />
      {showQuality && isLossyFormat(resolved) && (
        <Slider label="Quality" value={value.quality} min={1} max={100} onChange={(quality) => onChange({ quality })} hint="Lower quality gives smaller files." />
      )}
      {resolved === 'png' && (
        <Segmented<PngMode>
          label="PNG compression"
          value={value.pngMode}
          onChange={(pngMode) => onChange({ pngMode })}
          options={[
            { value: 'lossless', label: 'Lossless' },
            { value: 'palette', label: 'Palette (lossy)' },
          ]}
          hint={value.pngMode === 'lossless' ? 'Exact pixels, optimised with OxiPNG.' : 'Reduces colours for much smaller files.'}
        />
      )}
      {((resolved === 'png' && value.pngMode === 'palette') || resolved === 'gif') && (
        <Slider label="Colours" value={value.colors} min={2} max={256} onChange={(colors) => onChange({ colors })} />
      )}
      {!supportsTransparency(resolved) && (
        <Field label="Background for transparent areas" htmlFor="bg-color" hint={`${FORMATS[resolved].label} has no transparency.`}>
          <div className="flex items-center gap-3">
            <input id="bg-color" type="color" value={value.background} onChange={(e) => onChange({ background: e.target.value })} className="h-11 w-16 cursor-pointer rounded-lg border border-border bg-surface p-1" />
            <span className="font-mono text-sm text-muted">{value.background}</span>
          </div>
        </Field>
      )}
      <p className="text-xs text-muted">Metadata (EXIF, GPS, colour profiles) is removed for privacy; colours are converted to sRGB.</p>
    </div>
  );
}
