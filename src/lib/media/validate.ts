// Upload validation: magic bytes, empty/oversized files, decompression-bomb protection (spec §7, §A4).
import { sniff, SNIFF_BYTES } from './detect';
import { MediaError } from './errors';
import { FORMATS, type FormatId, type ImageFormatId, type MediaKind } from './formats';
import { readImageHeader, type ImageHeaderInfo } from './image-header';
import type { Limits } from './limits';
import { formatBytes } from './sizes';

export interface ValidatedFile {
  file: File;
  format: FormatId;
  kind: MediaKind;
  /** Present for images whose header could be parsed. */
  header: ImageHeaderInfo | null;
  /** True when the file extension does not match the detected content. */
  extensionMismatch: boolean;
}

export interface ValidateOptions {
  accept: readonly FormatId[];
  limits: Limits;
}

const HEADER_BYTES = 512 * 1024;
const TAIL_BYTES = 4096;

/**
 * Browsers silently decode truncated JPEG/PNG/GIF files (the missing area is filled grey),
 * so check that the end-of-image marker is present before accepting the file.
 */
export function looksTruncated(format: ImageFormatId, tail: Uint8Array): boolean {
  const has = (sig: number[]) => {
    for (let i = tail.length - sig.length; i >= 0; i--) if (sig.every((b, j) => tail[i + j] === b)) return true;
    return false;
  };
  switch (format) {
    case 'jpeg':
      return !has([0xff, 0xd9]);
    case 'png':
      return !has([0x49, 0x45, 0x4e, 0x44]); // IEND
    case 'gif':
      return !has([0x3b]);
    default:
      return false;
  }
}
const HEADERLESS_IMAGE_FORMATS: ReadonlySet<ImageFormatId> = new Set(['tiff', 'ico', 'svg']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export async function validateFile(file: File, { accept, limits }: ValidateOptions): Promise<ValidatedFile> {
  if (file.size === 0) throw new MediaError('EMPTY_FILE');

  const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
  const sniffed = sniff(head);
  if (sniffed.kind === 'rejected') {
    throw new MediaError('UNSUPPORTED_FORMAT', 'Playlist and concat files (m3u8, ffconcat) cannot be processed. Upload the media file itself.');
  }
  if (sniffed.kind === 'unknown') {
    throw new MediaError('UNSUPPORTED_FORMAT', "We couldn't recognise this file's format from its contents.");
  }

  const format = sniffed.format;
  const info = FORMATS[format];
  if (!accept.includes(format)) {
    const hint =
      info.kind === 'image' ? 'This is an image — try one of the image tools.' : info.kind === 'video' ? 'This is a video — try one of the video tools.' : '';
    throw new MediaError('UNSUPPORTED_FORMAT', `${info.label} files aren't supported by this tool. ${hint}`.trim());
  }

  const ext = extensionOf(file.name);
  const extensionMismatch = ext !== '' && !info.extensions.includes(ext);

  let header: ImageHeaderInfo | null = null;
  if (info.kind === 'image') {
    if (file.size > limits.imageBytes) {
      throw new MediaError('TOO_LARGE', `Images up to ${formatBytes(limits.imageBytes)} can be processed in this browser (this file is ${formatBytes(file.size)}).`);
    }
    const imageFormat = format as ImageFormatId;
    if (!HEADERLESS_IMAGE_FORMATS.has(imageFormat)) {
      // GIF frame counting needs the whole file; other formats keep their dimensions near the start.
      const bytes = new Uint8Array(await (imageFormat === 'gif' ? file : file.slice(0, HEADER_BYTES)).arrayBuffer());
      header = readImageHeader(imageFormat, bytes);
      if (!header || header.width === 0 || header.height === 0) throw new MediaError('CORRUPTED_FILE');
      const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
      if (looksTruncated(imageFormat, tail)) throw new MediaError('CORRUPTED_FILE', 'This image is incomplete — the end of the file is missing. It may not have finished downloading.');
      const pixels = header.width * header.height;
      if (pixels > limits.imagePixels) {
        throw new MediaError(
          'TOO_MANY_PIXELS',
          `This image is ${header.width}×${header.height} (${(pixels / 1e6).toFixed(1)} MP). The limit on this device is ${(limits.imagePixels / 1e6).toFixed(1)} MP.`,
        );
      }
    }
  } else if (file.size > limits.videoBytes) {
    throw new MediaError('TOO_LARGE', `Files up to ${formatBytes(limits.videoBytes)} can be processed in this browser (this file is ${formatBytes(file.size)}).`);
  }

  return { file, format, kind: info.kind, header, extensionMismatch };
}
