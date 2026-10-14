// Download helpers (spec §7): safe names, iOS-friendly links, streaming ZIP with a size cap.
import { downloadZip, predictLength } from 'client-zip';
import { MediaError } from './media/errors';
import { dedupeFilename } from './media/filenames';
import { formatBytes } from './media/sizes';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  // iOS Safari only honours `download` on links that are in the document.
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke late: mobile browsers read the blob asynchronously after the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Uses the share sheet where available (lets iOS users "Save to Photos/Files"); returns false if not supported. */
export async function shareFile(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
  if (!nav.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file] });
    return true;
  } catch {
    return false;
  }
}

export interface ZipEntry {
  name: string;
  blob: Blob;
}

/** Builds a ZIP with client-zip's streaming writer. Only successful files plus an optional failure summary. */
export async function buildZip(entries: ZipEntry[], failures: { name: string; reason: string }[], maxBytes: number): Promise<Blob> {
  const taken = new Set<string>();
  const now = new Date();
  const files = entries.map((e) => ({ name: dedupeFilename(e.name, taken), input: new Response(e.blob), size: e.blob.size, lastModified: now }));
  const extras: { name: string; input: string; size: number; lastModified: Date }[] = [];
  if (failures.length > 0) {
    const text = `These files could not be processed:\n\n${failures.map((f) => `- ${f.name}: ${f.reason}`).join('\n')}\n`;
    extras.push({ name: dedupeFilename('FAILED-FILES.txt', taken), input: text, size: new TextEncoder().encode(text).byteLength, lastModified: now });
  }
  const predicted = Number(predictLength([...files, ...extras].map((f) => ({ name: f.name, size: f.size }))));
  if (predicted > maxBytes) {
    throw new MediaError('TOO_LARGE', `The ZIP would be ${formatBytes(predicted)}; the limit is ${formatBytes(maxBytes)}. Download files individually instead.`);
  }
  return downloadZip([...files, ...extras], { length: predicted }).blob();
}
