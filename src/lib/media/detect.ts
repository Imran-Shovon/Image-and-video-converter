// Magic-byte detection. Never trust the file extension or the browser-supplied MIME type.
import type { FormatId, RejectedFormatId } from './formats';

export type SniffResult =
  | { kind: 'known'; format: FormatId }
  | { kind: 'rejected'; format: RejectedFormatId }
  | { kind: 'unknown' };

/** Number of leading bytes {@link sniff} needs. */
export const SNIFF_BYTES = 4100;

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  for (let i = start; i < start + length && i < bytes.length; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);
const M4V_BRANDS = new Set(['M4V ', 'M4VH', 'M4VP']);
const M4A_BRANDS = new Set(['M4A ', 'M4B ']);

function sniffIsoBmff(bytes: Uint8Array): FormatId | null {
  if (ascii(bytes, 4, 4) !== 'ftyp') return null;
  const boxSize = Math.min(
    ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0,
    bytes.length,
  );
  const major = ascii(bytes, 8, 4);
  const brands = [major];
  for (let off = 16; off + 4 <= boxSize; off += 4) brands.push(ascii(bytes, off, 4));

  if (brands.some((b) => AVIF_BRANDS.has(b))) return 'avif';
  if (HEIF_BRANDS.has(major)) return 'heic';
  if (major === 'qt  ') return 'mov';
  if (M4V_BRANDS.has(major)) return 'm4v';
  if (M4A_BRANDS.has(major)) return 'm4a';
  if (major.startsWith('3gp') || major.startsWith('3g2')) return '3gp';
  return 'mp4';
}

function sniffEbml(bytes: Uint8Array): FormatId | null {
  if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return null;
  // DocType element (0x4282) appears in the EBML header near the start.
  const head = ascii(bytes, 0, Math.min(bytes.length, 64));
  return head.includes('webm') ? 'webm' : 'mkv';
}

function sniffText(bytes: Uint8Array): SniffResult | null {
  let start = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) start = 3;
  const head = ascii(bytes, start, 512).trimStart();
  if (head.startsWith('#EXTM3U')) return { kind: 'rejected', format: 'hls-playlist' };
  if (head.startsWith('ffconcat')) return { kind: 'rejected', format: 'ffconcat' };
  if (/^<(\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return { kind: 'known', format: 'svg' };
  }
  return null;
}

export function sniff(bytes: Uint8Array): SniffResult {
  const known = (format: FormatId): SniffResult => ({ kind: 'known', format });
  if (bytes.length < 4) return { kind: 'unknown' };

  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return known('jpeg');
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return known('png');
  const sig6 = ascii(bytes, 0, 6);
  if (sig6 === 'GIF87a' || sig6 === 'GIF89a') return known('gif');
  if (ascii(bytes, 0, 4) === 'RIFF') {
    const sub = ascii(bytes, 8, 4);
    if (sub === 'WEBP') return known('webp');
    if (sub === 'AVI ') return known('avi');
    if (sub === 'WAVE') return known('wav');
  }
  if (ascii(bytes, 0, 2) === 'BM' && bytes.length >= 26) return known('bmp');
  if (startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return known('tiff');
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) && bytes[4] !== 0) return known('ico');

  const iso = sniffIsoBmff(bytes);
  if (iso) return known(iso);
  // QuickTime files without an ftyp box start directly with a moov/mdat/wide/free atom.
  if (['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(ascii(bytes, 4, 4))) return known('mov');

  const ebml = sniffEbml(bytes);
  if (ebml) return known(ebml);

  if (ascii(bytes, 0, 4) === 'OggS') {
    return ascii(bytes, 28, 8) === 'OpusHead' ? known('opus') : known('ogg');
  }
  if (ascii(bytes, 0, 3) === 'ID3') return known('mp3');
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && (bytes[1]! & 0x06) !== 0) return known('mp3');

  return sniffText(bytes) ?? { kind: 'unknown' };
}

export async function sniffBlob(blob: Blob): Promise<SniffResult> {
  const head = new Uint8Array(await blob.slice(0, SNIFF_BYTES).arrayBuffer());
  return sniff(head);
}
