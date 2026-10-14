// Image encoders. WASM codecs are loaded lazily the first time a format is used.
// Runs inside the image worker.
import { encodeBmp } from './bmp';
import type { ImageOutputFormat, PngMode } from './types';

export interface EncodeParams {
  format: ImageOutputFormat;
  quality: number;
  pngMode: PngMode;
  colors: number;
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

async function quantizeToPalette(data: ImageData, colors: number) {
  const { quantize, applyPalette } = await import('gifenc');
  const rgba = data.data;
  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 255) {
      hasAlpha = true;
      break;
    }
  }
  const format = hasAlpha ? 'rgba4444' : 'rgb565';
  const palette = quantize(rgba, clampInt(colors, 2, 256), hasAlpha ? { format, oneBitAlpha: false } : { format });
  const index = applyPalette(rgba, palette, format);
  return { palette, index, hasAlpha };
}

async function encodePngPalette(data: ImageData, colors: number): Promise<Uint8Array> {
  const { palette, index } = await quantizeToPalette(data, colors);
  const out = new Uint8ClampedArray(data.width * data.height * 4);
  for (let i = 0; i < index.length; i++) {
    const c = palette[index[i]!]!;
    const o = i * 4;
    out[o] = c[0]!;
    out[o + 1] = c[1]!;
    out[o + 2] = c[2]!;
    out[o + 3] = c.length > 3 ? c[3]! : 255;
  }
  // OxiPNG detects ≤256 colours and writes an indexed PNG.
  const { default: optimise } = await import('@jsquash/oxipng/optimise.js');
  return new Uint8Array(await optimise(new ImageData(out, data.width, data.height), { level: 2, optimiseAlpha: true }));
}

async function encodeGif(data: ImageData, colors: number): Promise<Uint8Array> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const rgba = data.data;
  let hasAlpha = false;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 128) {
      hasAlpha = true;
      break;
    }
  }
  const max = clampInt(colors, 2, 256);
  const encoder = GIFEncoder();
  if (hasAlpha) {
    const palette = quantize(rgba, max, { format: 'rgba4444', oneBitAlpha: true });
    const index = applyPalette(rgba, palette, 'rgba4444');
    const transparentIndex = Math.max(0, palette.findIndex((c) => c[3] === 0));
    encoder.writeFrame(index, data.width, data.height, { palette, transparent: true, transparentIndex });
  } else {
    const palette = quantize(rgba, max);
    const index = applyPalette(rgba, palette);
    encoder.writeFrame(index, data.width, data.height, { palette });
  }
  encoder.finish();
  return encoder.bytes();
}

export async function encodeImage(data: ImageData, params: EncodeParams): Promise<Uint8Array> {
  switch (params.format) {
    case 'jpeg': {
      const { default: encode } = await import('@jsquash/jpeg/encode.js');
      return new Uint8Array(await encode(data, { quality: clampInt(params.quality, 1, 100) }));
    }
    case 'webp': {
      const { default: encode } = await import('@jsquash/webp/encode.js');
      return new Uint8Array(await encode(data, { quality: clampInt(params.quality, 1, 100), method: 4 }));
    }
    case 'avif': {
      const { default: encode } = await import('@jsquash/avif/encode.js');
      return new Uint8Array(await encode(data, { quality: clampInt(params.quality, 1, 100), speed: 6 }));
    }
    case 'png': {
      if (params.pngMode === 'palette') return encodePngPalette(data, params.colors);
      const { default: optimise } = await import('@jsquash/oxipng/optimise.js');
      return new Uint8Array(await optimise(data, { level: 2, optimiseAlpha: true }));
    }
    case 'gif':
      return encodeGif(data, params.colors);
    case 'bmp':
      return encodeBmp(data.data, data.width, data.height);
  }
}

/** Decoders used when the browser cannot decode a format natively. */
export async function wasmDecode(format: string, bytes: ArrayBuffer): Promise<ImageData | null> {
  switch (format) {
    case 'avif': {
      const { default: decode } = await import('@jsquash/avif/decode.js');
      return (await decode(bytes)) ?? null;
    }
    case 'webp': {
      const { default: decode } = await import('@jsquash/webp/decode.js');
      return decode(bytes);
    }
    case 'jpeg': {
      const { default: decode } = await import('@jsquash/jpeg/decode.js');
      return decode(bytes);
    }
    case 'png': {
      const { default: decode } = await import('@jsquash/png/decode.js');
      return decode(bytes);
    }
    default:
      return null;
  }
}

export async function lanczosResize(data: ImageData, width: number, height: number): Promise<ImageData> {
  const { default: resize } = await import('@jsquash/resize');
  return resize(data, { width, height, method: 'lanczos3', fitMethod: 'stretch', premultiply: true, linearRGB: true });
}
