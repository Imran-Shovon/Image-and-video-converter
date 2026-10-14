// Safe download filenames: {original-name}-{operation}.{ext} (spec §7).

const RESERVED_WINDOWS = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_BASE_LENGTH = 100;

/** Strips the extension and any characters that are unsafe in filenames on Windows, macOS, Linux, iOS and Android. */
export function sanitizeBaseName(name: string): string {
  const withoutPath = name.split(/[\\/]/).pop() ?? '';
  const withoutExt = withoutPath.replace(/\.[^.]{1,10}$/, '');
  let base = withoutExt
    .normalize('NFC')
    // Control characters, reserved punctuation and bidi overrides.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  if (RESERVED_WINDOWS.test(base)) base = `${base}_`;
  // Truncate by code points so we never split a surrogate pair.
  const chars = Array.from(base);
  if (chars.length > MAX_BASE_LENGTH) base = chars.slice(0, MAX_BASE_LENGTH).join('').trim();
  return base || 'file';
}

export function outputFilename(originalName: string, operation: string, extension: string): string {
  const op = operation.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${sanitizeBaseName(originalName)}${op ? `-${op}` : ''}.${ext}`;
}

/** Returns a name that is not in `taken`, appending " (2)", " (3)" … before the extension. Adds the result to `taken`. */
export function dedupeFilename(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}
