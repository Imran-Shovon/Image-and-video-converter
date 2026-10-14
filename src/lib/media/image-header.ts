// Reads image dimensions, animation and EXIF orientation from file headers without decoding pixels.
// Used for decompression-bomb protection (reject before decoding) and to warn about animated input.
import type { ImageFormatId } from './formats';

export interface ImageHeaderInfo {
  width: number;
  height: number;
  animated: boolean;
  /** EXIF orientation 1–8 (JPEG only), 1 when absent. */
  orientation: number;
}

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u16le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u24le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const i32le = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24);
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

function png(b: Uint8Array): ImageHeaderInfo | null {
  if (b.length < 24 || tag(b, 12) !== 'IHDR') return null;
  let animated = false;
  for (let off = 8; off + 8 <= b.length; ) {
    const len = u32be(b, off);
    const type = tag(b, off + 4);
    if (type === 'acTL') animated = true;
    if (type === 'IDAT' || type === 'IEND') break;
    off += 12 + len;
  }
  return { width: u32be(b, 16), height: u32be(b, 20), animated, orientation: 1 };
}

function gif(b: Uint8Array): ImageHeaderInfo | null {
  if (b.length < 13) return null;
  const width = u16le(b, 6);
  const height = u16le(b, 8);
  let off = 13;
  if (b[10]! & 0x80) off += 3 * (1 << ((b[10]! & 0x07) + 1));
  let frames = 0;
  const skipSubBlocks = () => {
    while (off < b.length) {
      const size = b[off]!;
      off += 1;
      if (size === 0) return;
      off += size;
    }
  };
  while (off < b.length && frames < 2) {
    const block = b[off]!;
    if (block === 0x2c) {
      frames++;
      const packed = b[off + 9] ?? 0;
      off += 10;
      if (packed & 0x80) off += 3 * (1 << ((packed & 0x07) + 1));
      off += 1; // LZW minimum code size
      skipSubBlocks();
    } else if (block === 0x21) {
      off += 2;
      skipSubBlocks();
    } else {
      break; // trailer or corrupt data
    }
  }
  return { width, height, animated: frames > 1, orientation: 1 };
}

function bmp(b: Uint8Array): ImageHeaderInfo | null {
  if (b.length < 26) return null;
  const headerSize = b[14]! | (b[15]! << 8);
  if (headerSize === 12) return { width: u16le(b, 18), height: u16le(b, 20), animated: false, orientation: 1 };
  return { width: Math.abs(i32le(b, 18)), height: Math.abs(i32le(b, 22)), animated: false, orientation: 1 };
}

function webp(b: Uint8Array): ImageHeaderInfo | null {
  if (b.length < 30) return null;
  const chunk = tag(b, 12);
  if (chunk === 'VP8X') {
    const flags = b[20]!;
    return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1, animated: (flags & 0x02) !== 0, orientation: 1 };
  }
  if (chunk === 'VP8 ') {
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff, animated: false, orientation: 1 };
  }
  if (chunk === 'VP8L') {
    const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1, animated: false, orientation: 1 };
  }
  return null;
}

/** EXIF orientation from a JPEG APP1 segment (TIFF IFD0 tag 0x0112). */
export function readExifOrientation(b: Uint8Array, app1Start: number, app1Length: number): number {
  const exif = app1Start;
  if (tag(b, exif) !== 'Exif') return 1;
  const tiff = exif + 6;
  const little = b[tiff] === 0x49;
  const r16 = (o: number) => (little ? u16le(b, o) : u16be(b, o));
  const r32 = (o: number) => (little ? (u16le(b, o) | (u16le(b, o + 2) << 16)) >>> 0 : u32be(b, o));
  const ifd = tiff + r32(tiff + 4);
  const end = app1Start + app1Length;
  if (ifd + 2 > end) return 1;
  const count = r16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (r16(entry) === 0x0112) {
      const value = r16(entry + 8);
      return value >= 1 && value <= 8 ? value : 1;
    }
  }
  return 1;
}

function jpeg(b: Uint8Array): ImageHeaderInfo | null {
  let off = 2;
  let orientation = 1;
  while (off + 4 <= b.length) {
    if (b[off] !== 0xff) {
      off++;
      continue;
    }
    const marker = b[off + 1]!;
    if (marker === 0xff) {
      off++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      off += 2;
      continue;
    }
    const len = u16be(b, off + 2);
    if (marker === 0xe1 && orientation === 1) orientation = readExifOrientation(b, off + 4, len - 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && off + 9 <= b.length) {
      return { width: u16be(b, off + 7), height: u16be(b, off + 5), animated: false, orientation };
    }
    if (marker === 0xda) break; // start of scan without SOF: corrupt
    off += 2 + len;
  }
  return null;
}

/** HEIF/AVIF: use the largest `ispe` (image spatial extent) property. */
function isoImage(b: Uint8Array): ImageHeaderInfo | null {
  let width = 0;
  let height = 0;
  for (let i = 4; i + 16 <= b.length; i++) {
    if (b[i] === 0x69 && tag(b, i) === 'ispe') {
      const w = u32be(b, i + 8);
      const h = u32be(b, i + 12);
      if (w * h > width * height) {
        width = w;
        height = h;
      }
    }
  }
  const animated = tag(b, 8) === 'avis';
  return width > 0 && height > 0 ? { width, height, animated, orientation: 1 } : null;
}

export function readImageHeader(format: ImageFormatId, bytes: Uint8Array): ImageHeaderInfo | null {
  switch (format) {
    case 'png':
      return png(bytes);
    case 'gif':
      return gif(bytes);
    case 'bmp':
      return bmp(bytes);
    case 'webp':
      return webp(bytes);
    case 'jpeg':
      return jpeg(bytes);
    case 'avif':
    case 'heic':
      return isoImage(bytes);
    default:
      return null;
  }
}

/** True when orientation 5–8 swaps width and height. */
export function orientationSwapsAxes(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}
