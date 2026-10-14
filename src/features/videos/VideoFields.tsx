import { useEffect, useState } from 'react';
import { canEncodeVideo } from 'mediabunny';
import { advertisedVideoOutputs, type VideoOutputId } from '@/lib/media/capabilities';
import { detectFeatures } from '@/lib/media/features';
import { buildGeometry } from '@/lib/video-processing/args';
import { codecForOutput, CRF_RANGE, VIDEO_PRESETS, type VideoPresetId } from '@/lib/video-processing/presets';
import type { EncodeJob, SpeedPreset, VideoProbe, VideoTransform } from '@/lib/video-processing/types';
import { Segmented, Select, Slider, Switch } from '@/components/ui/primitives';

export type EncodeOutput = Exclude<VideoOutputId, 'gif'>;

export interface VideoEncodeSettings {
  output: EncodeOutput;
  preset: VideoPresetId | 'custom';
  crf: number;
  speed: SpeedPreset;
  audioKbps: number;
  removeAudio: boolean;
}

export const DEFAULT_VIDEO_ENCODE: VideoEncodeSettings = { output: 'mp4-h264', preset: 'balanced', crf: 26, speed: 'veryfast', audioKbps: 128, removeAudio: false };

let vp9Support: Promise<boolean> | null = null;

/** Outputs that rely on WebCodecs only (VP9) are offered when this browser can actually encode them. */
export function useWebCodecsOnlySupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    vp9Support ??= detectFeatures().webCodecs ? canEncodeVideo('vp9', { width: 1280, height: 720 }).catch(() => false) : Promise.resolve(false);
    void vp9Support.then((ok) => alive && setSupported(ok));
    return () => {
      alive = false;
    };
  }, []);
  return supported;
}

export function encodeOutputs() {
  return advertisedVideoOutputs().filter((o): o is typeof o & { id: EncodeOutput } => o.id !== 'gif');
}

/** Effective CRF/speed/audio for the chosen preset (presets are documented per codec in presets.ts). */
export function effectiveEncode(s: VideoEncodeSettings) {
  const codec = codecForOutput(s.output);
  if (s.preset === 'custom') return { crf: s.crf, speed: s.speed, audioKbps: s.audioKbps };
  const p = VIDEO_PRESETS[s.preset];
  return { crf: p.crf[codec], speed: p.speed, audioKbps: p.audioKbps };
}

export function buildEncodeJob(s: VideoEncodeSettings, transform: VideoTransform): EncodeJob {
  const e = effectiveEncode(s);
  return {
    type: 'encode',
    output: s.output,
    transform,
    rate: { mode: 'crf', crf: e.crf },
    speed: e.speed,
    audio: s.removeAudio ? { mode: 'remove' } : { mode: 'encode', bitrateKbps: e.audioKbps },
  };
}

export function VideoEncodeFields({ value, onChange, probe, showQuality = true }: { value: VideoEncodeSettings; onChange: (p: Partial<VideoEncodeSettings>) => void; probe?: VideoProbe; showQuality?: boolean }) {
  const outputs = encodeOutputs();
  const vp9 = useWebCodecsOnlySupport();
  const codec = codecForOutput(value.output);
  const range = CRF_RANGE[codec];
  const e = effectiveEncode(value);
  const selected = outputs.find((o) => o.id === value.output);
  return (
    <div className="flex flex-col gap-5">
      <Select<EncodeOutput>
        label="Output format"
        value={value.output}
        onChange={(output) => onChange({ output })}
        options={outputs.map((o) => {
          const unavailable = o.engines.length === 1 && o.engines[0] === 'webcodecs' && vp9 === false;
          return { value: o.id, label: unavailable ? `${o.label} — not available in this browser` : o.label, disabled: unavailable };
        })}
        hint={selected?.notes}
      />
      {showQuality && (
        <>
          <Segmented<VideoEncodeSettings['preset']>
            label="Quality"
            value={value.preset}
            onChange={(preset) => onChange(preset === 'custom' ? { preset, crf: e.crf, speed: e.speed, audioKbps: e.audioKbps } : { preset })}
            options={[
              { value: 'small', label: 'Small', title: VIDEO_PRESETS.small.description },
              { value: 'balanced', label: 'Balanced', title: VIDEO_PRESETS.balanced.description },
              { value: 'high', label: 'High', title: VIDEO_PRESETS.high.description },
              { value: 'custom', label: 'Custom' },
            ]}
            hint={value.preset === 'custom' ? undefined : `${VIDEO_PRESETS[value.preset].description} (CRF ${e.crf})`}
          />
          {value.preset === 'custom' && (
            <>
              <Slider label="Quality (CRF)" value={value.crf} min={range.min} max={range.max} onChange={(crf) => onChange({ crf })} hint="Lower CRF = higher quality and larger files." />
              <Select<SpeedPreset>
                label="Encoder speed"
                value={value.speed}
                onChange={(speed) => onChange({ speed })}
                options={[
                  { value: 'ultrafast', label: 'Fastest (larger files)' },
                  { value: 'veryfast', label: 'Fast' },
                  { value: 'faster', label: 'Moderate' },
                  { value: 'medium', label: 'Slow (smaller files)' },
                  { value: 'slow', label: 'Slowest' },
                ]}
              />
              <Slider label="Audio bitrate" value={value.audioKbps} min={48} max={320} step={16} onChange={(audioKbps) => onChange({ audioKbps })} format={(v) => `${v} kb/s`} />
            </>
          )}
        </>
      )}
      {probe?.audio && <Switch label="Remove audio" checked={value.removeAudio} onChange={(removeAudio) => onChange({ removeAudio })} />}
    </div>
  );
}

export type ResolutionChoice = 'original' | '2160' | '1440' | '1080' | '720' | '480' | '360';

/** Scales so the short side equals the chosen resolution ("1080p"), never upscaling. */
export function scaleForResolution(choice: ResolutionChoice, frame: { width: number; height: number }): VideoTransform['scale'] {
  if (choice === 'original') return undefined;
  const target = Number(choice);
  const short = Math.min(frame.width, frame.height);
  if (target >= short) return undefined;
  return frame.width >= frame.height ? { height: target } : { width: target };
}

export function ResolutionSelect({ value, onChange, frame }: { value: ResolutionChoice; onChange: (v: ResolutionChoice) => void; frame?: { width: number; height: number } }) {
  const short = frame ? Math.min(frame.width, frame.height) : Infinity;
  const options: { value: ResolutionChoice; label: string; disabled?: boolean }[] = [
    { value: 'original', label: frame ? `Original (${frame.width} × ${frame.height})` : 'Original' },
    ...(['2160', '1440', '1080', '720', '480', '360'] as const).map((r) => ({ value: r, label: `${r}p`, disabled: Number(r) >= short })),
  ];
  return <Select<ResolutionChoice> label="Resolution" value={value} onChange={onChange} options={options} hint="Lower resolutions encode faster and make smaller files." />;
}

/** Output size for a transform (used to show the user what they'll get). */
export function outputSize(probe: VideoProbe, transform: VideoTransform) {
  try {
    const g = buildGeometry(probe, transform, true);
    return { width: g.width, height: g.height };
  } catch {
    return null;
  }
}
