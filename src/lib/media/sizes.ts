// Size and time helpers. Sizes use decimal units everywhere (1 MB = 1,000,000 bytes), see docs/ARCHITECTURE.md.

export const KB = 1000;
export const MB = 1000 * KB;
export const GB = 1000 * MB;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${trim(bytes / KB)} KB`;
  if (bytes < GB) return `${trim(bytes / MB)} MB`;
  return `${trim(bytes / GB)} GB`;
}

function trim(value: number): string {
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return value.toFixed(digits).replace(/\.?0+$/, '');
}

export interface SizeChange {
  originalBytes: number;
  outputBytes: number;
  /** Positive when the output is smaller. Spec §8: ((original − output) / original) × 100. */
  reductionPercent: number;
  larger: boolean;
  label: string;
}

export function sizeChange(originalBytes: number, outputBytes: number): SizeChange {
  const reductionPercent = originalBytes > 0 ? ((originalBytes - outputBytes) / originalBytes) * 100 : 0;
  const larger = outputBytes > originalBytes;
  const rounded = Math.abs(reductionPercent) < 10 ? Math.abs(reductionPercent).toFixed(1) : Math.round(Math.abs(reductionPercent)).toString();
  const label =
    outputBytes === originalBytes ? 'Same size' : larger ? `+${rounded}% larger` : `${rounded}% smaller`;
  return { originalBytes, outputBytes, reductionPercent, larger, label };
}

/** Formats seconds as m:ss.mmm or h:mm:ss.mmm (milliseconds optional). */
export function formatDuration(seconds: number, withMillis = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalMs = Math.round(seconds * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const base = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  return withMillis ? `${base}.${String(ms).padStart(3, '0')}` : base;
}

/** Parses "1:02.5", "62.5", "00:01:02.500" into seconds. Returns null when invalid. */
export function parseTimecode(input: string): number | null {
  const text = input.trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(text)) return null;
  const parts = text.split(':').map(Number);
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return Number.isFinite(seconds) ? seconds : null;
}

export function parseSizeInput(value: number, unit: 'KB' | 'MB'): number {
  return Math.round(value * (unit === 'KB' ? KB : MB));
}
