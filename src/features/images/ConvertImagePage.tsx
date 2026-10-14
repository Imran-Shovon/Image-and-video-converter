import { toolById } from '@/features/tools';
import { usePersistentSettings } from '@/hooks/usePersistentSettings';
import { DEFAULT_ENCODE, EncodeFields, toEncodeSettings, transparencyWarning, type EncodeFormSettings } from './EncodeFields';
import { ImageToolShell } from './ImageToolShell';

const DEFAULTS: EncodeFormSettings = { ...DEFAULT_ENCODE, format: 'webp' };

export default function ConvertImagePage() {
  const [settings, update] = usePersistentSettings('image-convert', DEFAULTS);
  return (
    <ImageToolShell
      tool={toolById('image-convert')!}
      operation="converted"
      multiple
      actionLabel="Convert"
      settings={(probe) => <EncodeFields value={settings} onChange={update} probe={probe} allowSame={false} />}
      warnings={(item) => transparencyWarning(settings, item)}
      buildJob={(item) => ({ file: item.file, ops: [], encode: toEncodeSettings(settings, item.probe!) })}
    />
  );
}
