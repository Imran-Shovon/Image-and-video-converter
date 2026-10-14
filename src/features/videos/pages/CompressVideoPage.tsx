import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { formatBytes, parseSizeInput } from '@/lib/media/sizes';
import { estimateBytes, planTargetBitrate } from '@/lib/video-processing/bitrate';
import type { EnginePreference } from '@/lib/video-processing/engine';
import type { VideoJob } from '@/lib/video-processing/types';
import { Alert, NumberInput, Segmented, Select, Switch } from '@/components/ui/primitives';
import { DEFAULT_VIDEO_ENCODE, ResolutionSelect, VideoEncodeFields, buildEncodeJob, effectiveEncode, outputSize, scaleForResolution, type ResolutionChoice, type VideoEncodeSettings } from '../VideoFields';
import { VideoToolShell } from '../VideoToolShell';
import type { VideoItem } from '../useVideoQueue';

interface Settings extends VideoEncodeSettings {
  mode: 'quality' | 'target';
  targetMb: number;
  twoPass: boolean;
  resolution: ResolutionChoice;
  fps: 'original' | '60' | '30' | '24' | '15';
  engine: EnginePreference;
}

const DEFAULTS: Settings = { ...DEFAULT_VIDEO_ENCODE, mode: 'quality', targetMb: 25, twoPass: true, resolution: 'original', fps: 'original', engine: 'auto' };

function plan(item: VideoItem, s: Settings) {
  const probe = item.probe!;
  const transform = { scale: scaleForResolution(s.resolution, probe.video!), fps: s.fps === 'original' ? undefined : Number(s.fps) };
  const size = outputSize(probe, transform) ?? { width: probe.video!.width, height: probe.video!.height };
  const audioKbps = s.removeAudio || !probe.audio ? 0 : effectiveEncode(s).audioKbps;
  const bitrate = s.mode === 'target' && probe.durationSec ? planTargetBitrate(parseSizeInput(s.targetMb, 'MB'), probe.durationSec, audioKbps, size.width, size.height) : null;
  return { transform, size, bitrate, audioKbps };
}

export default function CompressVideoPage() {
  const [s, update] = usePersistentSettings('video-compress', DEFAULTS);

  const buildJob = (item: VideoItem): VideoJob => {
    const p = plan(item, s);
    const job = buildEncodeJob(s, p.transform);
    if (p.bitrate) job.rate = { mode: 'bitrate', videoKbps: p.bitrate.videoKbps, twoPass: s.twoPass };
    return job;
  };

  return (
    <VideoToolShell
      tool={toolById('video-compress')!}
      operation="compressed"
      multiple
      actionLabel="Compress"
      offerKeepOriginal
      engine={s.engine}
      onEngineChange={(engine) => update({ engine })}
      settingsError={s.mode === 'target' && !(s.targetMb > 0) ? 'Enter a target size greater than zero.' : null}
      itemError={(item) => {
        if (s.mode !== 'target') return null;
        if (!item.probe?.durationSec) return 'This video has no known duration, so a target size can’t be calculated. Use a quality preset instead.';
        const p = plan(item, s);
        if (p.bitrate && p.bitrate.videoKbps < 50) return `${s.targetMb} MB is too small for a ${Math.round(item.probe.durationSec)} s video. Choose a larger target or a shorter clip.`;
        return null;
      }}
      buildJob={buildJob}
      settings={(item) => {
        const p = item?.probe ? plan(item, s) : null;
        const e = effectiveEncode(s);
        return (
          <div className="flex flex-col gap-5">
            <Segmented<Settings['mode']>
              label="Compress by"
              value={s.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: 'quality', label: 'Quality preset' },
                { value: 'target', label: 'Target size' },
              ]}
            />
            <VideoEncodeFields value={s} onChange={update} probe={item?.probe} showQuality={s.mode === 'quality'} />
            {s.mode === 'target' && (
              <>
                <NumberInput label="Target size" suffix="MB" value={s.targetMb} min={0.1} step={0.5} onChange={(v) => update({ targetMb: v === '' ? 0 : v })} invalid={!(s.targetMb > 0)} />
                <Switch label="Two-pass encoding" checked={s.twoPass} onChange={(twoPass) => update({ twoPass })} hint="More accurate size, takes about twice as long. Uses the compatible engine." />
                {p?.bitrate && (
                  <p className="text-sm text-muted" data-testid="bitrate-plan">
                    Video bitrate: <strong className="text-text">{p.bitrate.videoKbps.toLocaleString()} kb/s</strong>
                    {p.audioKbps > 0 && ` + ${p.audioKbps} kb/s audio`}
                  </p>
                )}
                {p?.bitrate?.tooLow && (
                  <Alert tone="warning" title="Quality will be very low">
                    {p.bitrate.suggestedMaxEdge
                      ? `That bitrate is low for ${p.size.width}×${p.size.height}. Try a lower resolution (around ${p.bitrate.suggestedMaxEdge}px wide) or a larger target.`
                      : 'That bitrate is too low for good quality at any common resolution. Choose a larger target size.'}
                  </Alert>
                )}
              </>
            )}
            <ResolutionSelect value={s.resolution} onChange={(resolution) => update({ resolution })} frame={item?.probe?.video ?? undefined} />
            <Select<Settings['fps']>
              label="Frame rate"
              value={s.fps}
              onChange={(fps) => update({ fps })}
              options={[
                { value: 'original', label: item?.probe?.video?.fps ? `Original (${Math.round(item.probe.video.fps)} fps)` : 'Original' },
                { value: '60', label: '60 fps' },
                { value: '30', label: '30 fps' },
                { value: '24', label: '24 fps' },
                { value: '15', label: '15 fps' },
              ]}
            />
            {item?.probe?.durationSec && (
              <p className="text-sm text-muted" data-testid="size-estimate">
                {s.mode === 'target' && p?.bitrate
                  ? `Estimated size: about ${formatBytes(estimateBytes(p.bitrate.videoKbps, p.audioKbps, item.probe.durationSec))} (best effort).`
                  : `Size depends on the content; quality presets don’t guarantee a size. CRF ${e.crf}.`}
              </p>
            )}
          </div>
        );
      }}
    />
  );
}
