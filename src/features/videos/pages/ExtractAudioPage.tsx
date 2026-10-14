import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { advertisedAudioOutputs } from '@/lib/media/capabilities';
import { FORMATS } from '@/lib/media/formats';
import type { AudioOutputFormat } from '@/lib/video-processing/types';
import { Select, Slider, Switch } from '@/components/ui/primitives';
import { VideoToolShell } from '../VideoToolShell';

interface Settings {
  format: AudioOutputFormat;
  bitrateKbps: number;
  allowCopy: boolean;
}

const DEFAULTS: Settings = { format: 'mp3', bitrateKbps: 192, allowCopy: true };
const COPYABLE: Record<AudioOutputFormat, string> = { mp3: 'mp3', m4a: 'aac', wav: 'pcm_s16le', opus: 'opus' };

export default function ExtractAudioPage() {
  const [s, update] = usePersistentSettings('video-extract-audio', DEFAULTS);
  return (
    <VideoToolShell
      tool={toolById('video-extract-audio')!}
      operation="audio"
      multiple
      actionLabel="Extract audio"
      resultKind="audio"
      itemError={(item) => (item.probe && !item.probe.audio ? 'This video has no audio track, so there is nothing to extract.' : null)}
      buildJob={() => ({ type: 'extract-audio', format: s.format, bitrateKbps: s.bitrateKbps, allowCopy: s.allowCopy })}
      settings={(item) => {
        const willCopy = s.allowCopy && item?.probe?.audio?.codec === COPYABLE[s.format];
        return (
          <div className="flex flex-col gap-5">
            <Select<AudioOutputFormat>
              label="Audio format"
              value={s.format}
              onChange={(format) => update({ format })}
              options={advertisedAudioOutputs().map((o) => ({ value: o.format, label: `${FORMATS[o.format].label} — ${o.codec}` }))}
            />
            {s.format !== 'wav' && !willCopy && (
              <Slider label="Bitrate" value={s.bitrateKbps} min={64} max={320} step={32} onChange={(bitrateKbps) => update({ bitrateKbps })} format={(v) => `${v} kb/s`} />
            )}
            <Switch
              label="Copy without re-encoding when possible"
              checked={s.allowCopy}
              onChange={(allowCopy) => update({ allowCopy })}
              hint={willCopy ? 'The source audio already uses this codec, so it will be copied with no quality loss.' : 'Applies when the source audio already uses the chosen codec.'}
            />
          </div>
        );
      }}
    />
  );
}
