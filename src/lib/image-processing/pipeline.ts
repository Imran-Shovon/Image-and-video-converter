// Image processing pipeline: decode → orient → transform → encode → verify (spec §8).
// Runs inside the image worker; every step works on OffscreenCanvas or ImageData.
import { sniff } from '@/lib/media/detect';
import { MediaError } from '@/lib/media/errors';
import { FORMATS, type ImageFormatId } from '@/lib/media/formats';
import { readImageHeader, type ImageHeaderInfo } from '@/lib/media/image-header';
import {
  applyExifOrientation,
  applyGeometricOp,
  canvasResize,
  createCanvas,
  flattenOnto,
  hasTransparency,
  imageDataToCanvas,
  readImageData,
  release,
} from './canvas-ops';
import { encodeImage, lanczosResize, wasmDecode, type EncodeParams } from './encoders';
import { fitWithin, sizeAfterOps } from './geometry';
import { isLossyFormat, supportsTransparency } from './presets';
import { searchTargetSize } from './target-size';
import type { ImageJobInput, ImageJobResult, ImageProbe, ImageProgress } from './types';

type ProgressFn = (p: ImageProgress) => void;

interface Decoded {
  canvas: OffscreenCanvas;
  format: ImageFormatId;
  header: ImageHeaderInfo | null;
}

let browserAppliesOrientation: Promise<boolean> | null = null;

/**
 * Detects whether createImageBitmap honours EXIF orientation by decoding a 2×1 JPEG tagged with orientation 6.
 * If the result is 1×2 the browser rotated it.
 */
function detectOrientationSupport(): Promise<boolean> {
  browserAppliesOrientation ??= (async () => {
    try {
      const { canvas, ctx } = createCanvas(2, 1);
      ctx.fillRect(0, 0, 2, 1);
      const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
      // prettier-ignore
      const app1 = [0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
        0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
      const tagged = new Uint8Array(jpeg.length + app1.length);
      tagged.set(jpeg.subarray(0, 2), 0);
      tagged.set(app1, 2);
      tagged.set(jpeg.subarray(2), 2 + app1.length);
      const bitmap = await createImageBitmap(new Blob([tagged], { type: 'image/jpeg' }));
      const applied = bitmap.width === 1 && bitmap.height === 2;
      bitmap.close();
      return applied;
    } catch {
      return true;
    }
  })();
  return browserAppliesOrientation;
}

async function decode(file: Blob): Promise<Decoded> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new MediaError('EMPTY_FILE');
  const sniffed = sniff(bytes.subarray(0, 4100));
  if (sniffed.kind !== 'known' || FORMATS[sniffed.format].kind !== 'image' || sniffed.format === 'svg') {
    throw new MediaError('UNSUPPORTED_FORMAT');
  }
  const format = sniffed.format as ImageFormatId;
  const header = readImageHeader(format, bytes);

  let canvas: OffscreenCanvas | null = null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const orientation = header?.orientation ?? 1;
    if (orientation !== 1 && !(await detectOrientationSupport())) {
      canvas = applyExifOrientation(bitmap, orientation);
      bitmap.close();
    } else {
      const { canvas: c, ctx } = createCanvas(bitmap.width, bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      canvas = c;
    }
  } catch {
    const data = await wasmDecode(format, bytes.buffer as ArrayBuffer).catch(() => null);
    if (data) {
      canvas = imageDataToCanvas(data);
      const orientation = header?.orientation ?? 1;
      if (orientation !== 1) {
        const oriented = applyExifOrientation(canvas, orientation);
        release(canvas);
        canvas = oriented;
      }
    }
  }
  if (!canvas) {
    if (format === 'heic' || format === 'tiff' || format === 'ico') {
      throw new MediaError('CODEC_UNAVAILABLE', `This browser can't decode ${FORMATS[format].label} images. Try Safari, or convert the file on the device that created it.`);
    }
    throw new MediaError('CORRUPTED_FILE');
  }
  return { canvas, format, header };
}

export interface InspectResult {
  probe: ImageProbe;
  preview: { blob: Blob; width: number; height: number };
}

/** Decodes once and returns both the probe and a downscaled, correctly oriented preview (PNG if transparent, else JPEG). */
export async function inspectImage(file: Blob, maxEdge: number): Promise<InspectResult> {
  const { canvas, format, header } = await decode(file);
  const size = fitWithin(canvas, maxEdge, maxEdge);
  const preview = canvasResize(canvas, size.width, size.height);
  const hasAlpha = hasTransparency(readImageData(preview));
  const blob = await preview.convertToBlob(hasAlpha ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.9 });
  const result: InspectResult = {
    probe: { format, width: canvas.width, height: canvas.height, animated: header?.animated ?? false, hasAlpha, orientation: header?.orientation ?? 1 },
    preview: { blob, width: preview.width, height: preview.height },
  };
  release(preview);
  release(canvas);
  return result;
}

async function verifyOutput(data: Uint8Array, format: EncodeParams['format'], width: number, height: number): Promise<void> {
  if (data.byteLength === 0) throw new MediaError('VALIDATION_FAILED', 'The encoder produced an empty file.');
  const sniffed = sniff(data.subarray(0, 4100));
  if (sniffed.kind !== 'known' || sniffed.format !== format) {
    throw new MediaError('VALIDATION_FAILED', `The encoder did not produce a ${FORMATS[format].label} file, so it was discarded.`);
  }
  let decodedWidth: number;
  let decodedHeight: number;
  try {
    const bitmap = await createImageBitmap(new Blob([data as Uint8Array<ArrayBuffer>], { type: FORMATS[format].mime }));
    decodedWidth = bitmap.width;
    decodedHeight = bitmap.height;
    bitmap.close();
  } catch {
    const decoded = await wasmDecode(format, data.slice().buffer).catch(() => null);
    if (!decoded) throw new MediaError('VALIDATION_FAILED', 'The output file could not be decoded.');
    decodedWidth = decoded.width;
    decodedHeight = decoded.height;
  }
  if (decodedWidth !== width || decodedHeight !== height) {
    throw new MediaError('VALIDATION_FAILED', `Output is ${decodedWidth}×${decodedHeight} but ${width}×${height} was expected.`);
  }
}

export async function processImage(job: ImageJobInput, onProgress: ProgressFn): Promise<ImageJobResult> {
  const { encode } = job;
  const notes: string[] = [];
  onProgress({ stage: 'decode', fraction: null });
  const decoded = await decode(job.file);
  if (decoded.header?.animated) notes.push('Animated image: only the first frame was processed.');
  let current = decoded.canvas;

  onProgress({ stage: 'transform', fraction: null });
  const expected = sizeAfterOps(current.width, current.height, job.ops);
  for (const op of job.ops) {
    let next: OffscreenCanvas;
    if (op.type === 'resize') {
      const width = Math.max(1, Math.round(op.width));
      const height = Math.max(1, Math.round(op.height));
      if (width === current.width && height === current.height) continue;
      next = imageDataToCanvas(await lanczosResize(readImageData(current), width, height));
    } else {
      next = applyGeometricOp(current, op);
    }
    release(current);
    current = next;
  }

  if (!supportsTransparency(encode.format) && hasTransparency(readImageData(current))) {
    const flat = flattenOnto(current, encode.background);
    release(current);
    current = flat;
    notes.push(`Transparent areas were filled with ${encode.background} because ${FORMATS[encode.format].label} has no transparency.`);
  }

  const baseData = readImageData(current);
  release(current);
  const params: EncodeParams = { format: encode.format, quality: encode.quality, pngMode: encode.pngMode, colors: encode.colors };

  let output: Uint8Array;
  let width = baseData.width;
  let height = baseData.height;
  let quality = encode.quality;
  let target: ImageJobResult['target'];

  if (encode.targetBytes && encode.targetBytes > 0) {
    // Lossy formats search quality; palette formats search the colour count; lossless formats can only downscale.
    const usesColors = encode.format === 'gif' || (encode.format === 'png' && encode.pngMode === 'palette');
    const searchable = isLossyFormat(encode.format) || usesColors;
    const maxQ = usesColors ? encode.colors : 100;
    const scaled = new Map<number, ImageData>([[1, baseData]]);
    const result = await searchTargetSize({
      targetBytes: encode.targetBytes,
      minQuality: searchable ? (usesColors ? 2 : 5) : maxQ,
      maxQuality: searchable ? maxQ : maxQ,
      allowDownscale: encode.allowDownscale ?? false,
      encode: async (q, scale) => {
        let data = scaled.get(scale);
        if (!data) {
          data = await lanczosResize(baseData, Math.max(1, Math.round(baseData.width * scale)), Math.max(1, Math.round(baseData.height * scale)));
          scaled.set(scale, data);
        }
        return encodeImage(data, usesColors ? { ...params, colors: q } : { ...params, quality: q });
      },
      onAttempt: (n, total) => onProgress({ stage: 'encode', fraction: Math.min(0.99, n / total), message: `Trying setting ${n}` }),
    });
    output = result.best.data;
    const finalData = scaled.get(result.best.scale)!;
    width = finalData.width;
    height = finalData.height;
    quality = result.best.quality;
    target = { requestedBytes: encode.targetBytes, met: result.met, downscaled: result.downscaled };
    if (result.downscaled) notes.push(`Downscaled to ${width}×${height} to approach the target size.`);
    if (!result.met) notes.push('The target size could not be reached; this is the smallest result achieved.');
  } else {
    onProgress({ stage: 'encode', fraction: null });
    output = await encodeImage(baseData, params);
    if (expected.width !== width || expected.height !== height) {
      throw new MediaError('VALIDATION_FAILED', 'Output dimensions did not match the requested operations.');
    }
  }

  onProgress({ stage: 'verify', fraction: null });
  await verifyOutput(output, encode.format, width, height);
  const mime = FORMATS[encode.format].mime;
  return {
    blob: new Blob([output as Uint8Array<ArrayBuffer>], { type: mime }),
    format: encode.format,
    mime,
    width,
    height,
    bytes: output.byteLength,
    quality,
    target,
    notes,
  };
}
