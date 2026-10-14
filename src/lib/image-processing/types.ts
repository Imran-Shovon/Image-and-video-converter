import type { ImageOutputFormat } from '@/lib/media/capabilities';
import type { ImageFormatId } from '@/lib/media/formats';

export type { ImageOutputFormat };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Operations are applied in array order. Coordinates refer to the image as it looks after the previous operations. */
export type ImageOperation =
  | { type: 'crop'; rect: Rect }
  | { type: 'rotate'; degrees: number; background: string }
  | { type: 'flip'; horizontal: boolean; vertical: boolean }
  | { type: 'resize'; width: number; height: number }
  /**
   * Multiplies the image's alpha by a greyscale mask (0 = transparent, 255 = opaque). The mask may have any
   * size; it is stretched over the whole image. Optionally fills the removed areas with a solid colour.
   */
  | { type: 'mask'; mask: Uint8Array; maskWidth: number; maskHeight: number; background: string | null };

export type PngMode = 'lossless' | 'palette';

export interface ImageEncodeSettings {
  format: ImageOutputFormat;
  /** 1–100, used by lossy formats (JPEG, WebP, AVIF). */
  quality: number;
  pngMode: PngMode;
  /** 2–256, used by PNG palette mode and GIF. */
  colors: number;
  /** CSS hex colour used when flattening transparency for JPEG/BMP and for fine-angle rotation fills. */
  background: string;
  /** Optional best-effort target size in bytes. */
  targetBytes?: number;
  /** Allow downscaling when the target size cannot be reached by quality alone. */
  allowDownscale?: boolean;
}

export interface ImageProbe {
  format: ImageFormatId;
  /** Dimensions as displayed (EXIF orientation applied). */
  width: number;
  height: number;
  animated: boolean;
  hasAlpha: boolean;
  orientation: number;
}

export interface ImageJobInput {
  file: Blob;
  ops: ImageOperation[];
  encode: ImageEncodeSettings;
}

export interface ImageJobResult {
  blob: Blob;
  format: ImageOutputFormat;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  /** Quality actually used (may differ from the request when a target size is set). */
  quality: number;
  /** Set when a target size was requested. */
  target?: { requestedBytes: number; met: boolean; downscaled: boolean };
  notes: string[];
}

export type ImageProgress = {
  stage: 'download' | 'model' | 'segment' | 'decode' | 'transform' | 'encode' | 'verify';
  fraction: number | null;
  message?: string;
};
