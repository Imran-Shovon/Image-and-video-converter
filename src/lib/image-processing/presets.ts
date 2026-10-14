// Documented compression presets (spec §A2). Quality values are per-format because each codec's scale differs.
import type { ImageOutputFormat } from './types';

export type ImagePresetId = 'small' | 'balanced' | 'high';

export interface ImagePreset {
  id: ImagePresetId;
  label: string;
  description: string;
  quality: Record<'jpeg' | 'webp' | 'avif', number>;
  /** Palette size for PNG palette mode and GIF. */
  colors: number;
  pngMode: 'lossless' | 'palette';
}

export const IMAGE_PRESETS: Record<ImagePresetId, ImagePreset> = {
  small: {
    id: 'small',
    label: 'Low size',
    description: 'Smallest files; visible artifacts on close inspection.',
    quality: { jpeg: 55, webp: 55, avif: 40 },
    colors: 64,
    pngMode: 'palette',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Good quality at a much smaller size. Recommended.',
    quality: { jpeg: 75, webp: 75, avif: 55 },
    colors: 256,
    pngMode: 'palette',
  },
  high: {
    id: 'high',
    label: 'High quality',
    description: 'Hard to tell apart from the original.',
    quality: { jpeg: 90, webp: 90, avif: 75 },
    colors: 256,
    pngMode: 'lossless',
  },
};

export function presetQuality(preset: ImagePresetId, format: ImageOutputFormat): number {
  const q = IMAGE_PRESETS[preset].quality;
  return format === 'jpeg' || format === 'webp' || format === 'avif' ? q[format] : 100;
}

export const isLossyFormat = (format: ImageOutputFormat) => format === 'jpeg' || format === 'webp' || format === 'avif';
export const supportsTransparency = (format: ImageOutputFormat) => format !== 'jpeg' && format !== 'bmp';
