import { useCallback, useEffect, useState } from 'react';
import { readStored, writeStored } from '@/lib/storage';

/** Per-tool settings remembered in localStorage (spec §4). Unknown or invalid stored keys fall back to defaults. */
export function usePersistentSettings<T extends object>(toolId: string, defaults: T) {
  const key = `mt-settings:${toolId}`;
  const [settings, setSettings] = useState<T>(() => {
    const stored = readStored<Partial<T>>(key);
    if (!stored || typeof stored !== 'object') return defaults;
    const merged = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      if (k in stored && typeof stored[k] === typeof defaults[k]) merged[k] = stored[k] as T[keyof T];
    }
    return merged;
  });

  useEffect(() => writeStored(key, settings), [key, settings]);

  const update = useCallback((patch: Partial<T>) => setSettings((s) => ({ ...s, ...patch })), []);
  const reset = useCallback(() => setSettings(defaults), [defaults]);
  return [settings, update, reset] as const;
}
