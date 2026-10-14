import { useEffect, useState } from 'react';
import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { backgroundEngine, detectWebGpu, modelDownloadBytes, MODEL_INFO, type WebGpuSupport } from '@/lib/background-removal/engine';
import { isLossyFormat } from '@/lib/image-processing/presets';
import type { ImageOutputFormat } from '@/lib/image-processing/types';
import { advertisedImageOutputs } from '@/lib/media/capabilities';
import { FORMATS } from '@/lib/media/formats';
import { formatBytes } from '@/lib/media/sizes';
import { Alert, Field, Segmented, Select, Slider } from '@/components/ui/primitives';
import { ImageToolShell } from './ImageToolShell';
import type { BuildJob } from './useImageQueue';

type BackgroundMode = 'transparent' | 'color';

interface RemoveBackgroundSettings {
  mode: BackgroundMode;
  color: string;
  transparentFormat: string;
  solidFormat: string;
  quality: number;
}

const DEFAULTS: RemoveBackgroundSettings = { mode: 'transparent', color: '#ffffff', transparentFormat: 'png', solidFormat: 'jpeg', quality: 90 };

const TRANSPARENT_OUTPUTS: ImageOutputFormat[] = ['png', 'webp', 'avif'];
const SOLID_OUTPUTS: ImageOutputFormat[] = ['jpeg', 'png', 'webp'];

function outputsFor(mode: BackgroundMode): ImageOutputFormat[] {
  const advertised = new Set(advertisedImageOutputs().map((o) => o.format));
  return (mode === 'transparent' ? TRANSPARENT_OUTPUTS : SOLID_OUTPUTS).filter((f) => advertised.has(f));
}

function chosenFormat(s: RemoveBackgroundSettings): ImageOutputFormat {
  const options = outputsFor(s.mode);
  const wanted = (s.mode === 'transparent' ? s.transparentFormat : s.solidFormat) as ImageOutputFormat;
  return options.includes(wanted) ? wanted : options[0]!;
}

export default function RemoveBackgroundPage() {
  const [s, update] = usePersistentSettings('image-remove-background', DEFAULTS);
  const [gpu, setGpu] = useState<WebGpuSupport | null>(null);

  useEffect(() => {
    let active = true;
    void detectWebGpu().then((result) => {
      if (active) setGpu(result);
    });
    return () => {
      active = false;
    };
  }, []);

  const format = chosenFormat(s);

  const buildJob: BuildJob = async (item, { signal, onProgress }) => {
    // The oriented, downscaled preview is plenty for the model's 1024×1024 input; the mask is then
    // applied to the full-resolution image.
    const preview = await fetch(item.preview!.url).then((r) => r.blob());
    const { mask, size } = await backgroundEngine.segment(preview, { signal, onProgress });
    return {
      file: item.file,
      ops: [{ type: 'mask', mask, maskWidth: size, maskHeight: size, background: s.mode === 'color' ? s.color : null }],
      encode: { format, quality: s.quality, pngMode: 'lossless', colors: 256, background: s.color },
    };
  };

  const settingsError = gpu && !gpu.available ? 'Background removal needs WebGPU, which this browser or device does not provide. Try a recent version of Chrome, Edge or Safari.' : null;

  return (
    <ImageToolShell
      tool={toolById('image-remove-background')!}
      operation="no-background"
      multiple
      actionLabel="Remove background"
      settingsError={settingsError}
      warnings={(item) => (item.probe?.animated ? ['This is an animated image. Only the first frame will be processed.'] : [])}
      buildJob={buildJob}
      settings={() => (
        <div className="flex flex-col gap-5">
          {gpu?.available && (
            <Alert tone="info">
              The first time, this tool downloads the {MODEL_INFO.name} AI model (about {formatBytes(modelDownloadBytes(gpu.f16))}) to this device. It is kept for next time. Your images are never uploaded.
            </Alert>
          )}
          <Segmented<BackgroundMode>
            label="Background"
            value={s.mode}
            onChange={(mode) => update({ mode })}
            options={[
              { value: 'transparent', label: 'Transparent' },
              { value: 'color', label: 'Solid colour' },
            ]}
          />
          {s.mode === 'color' && (
            <Field label="Background colour" htmlFor="bg-remove-color">
              <div className="flex items-center gap-3">
                <input
                  id="bg-remove-color"
                  type="color"
                  value={s.color}
                  onChange={(e) => update({ color: e.target.value })}
                  className="h-11 w-16 cursor-pointer rounded-lg border border-border bg-surface p-1"
                />
                <span className="font-mono text-sm text-muted">{s.color}</span>
              </div>
            </Field>
          )}
          <Select<ImageOutputFormat>
            label="Output format"
            value={format}
            onChange={(f) => update(s.mode === 'transparent' ? { transparentFormat: f } : { solidFormat: f })}
            options={outputsFor(s.mode).map((f) => ({ value: f, label: FORMATS[f].label }))}
            hint={s.mode === 'transparent' ? 'These formats keep transparency.' : undefined}
          />
          {isLossyFormat(format) && <Slider label="Quality" value={s.quality} min={1} max={100} onChange={(quality) => update({ quality })} />}
          <p className="text-xs text-muted">Works best on photos with a clear subject (people, products, animals). Metadata is removed.</p>
        </div>
      )}
    />
  );
}
