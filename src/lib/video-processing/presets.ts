// Documented video presets (spec §B2). CRF scales differ per codec, so values are listed per codec.
import type { VideoOutputId } from '@/lib/media/capabilities';
import type { SpeedPreset } from './types';

export type VideoPresetId = 'small' | 'balanced' | 'high';

export interface VideoPreset {
  id: VideoPresetId;
  label: string;
  description: string;
  crf: { h264: number; h265: number; vp9: number; vp8: number };
  audioKbps: number;
  speed: SpeedPreset;
}

export const VIDEO_PRESETS: Record<VideoPresetId, VideoPreset> = {
  small: {
    id: 'small',
    label: 'Small file',
    description: 'Noticeably softer, but much smaller.',
    crf: { h264: 30, h265: 32, vp9: 40, vp8: 30 },
    audioKbps: 96,
    speed: 'veryfast',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Good quality at a reasonable size. Recommended.',
    crf: { h264: 26, h265: 28, vp9: 34, vp8: 20 },
    audioKbps: 128,
    speed: 'veryfast',
  },
  high: {
    id: 'high',
    label: 'High quality',
    description: 'Close to the original; larger files.',
    crf: { h264: 21, h265: 24, vp9: 28, vp8: 10 },
    audioKbps: 160,
    speed: 'faster',
  },
};

export type VideoCodecKey = keyof VideoPreset['crf'];

export function codecForOutput(id: Exclude<VideoOutputId, 'gif'>): VideoCodecKey {
  switch (id) {
    case 'mp4-h264':
    case 'mov-h264':
      return 'h264';
    case 'mp4-h265':
      return 'h265';
    case 'webm-vp9':
      return 'vp9';
    case 'webm-vp8':
      return 'vp8';
  }
}

export const CRF_RANGE: Record<VideoCodecKey, { min: number; max: number }> = {
  h264: { min: 0, max: 51 },
  h265: { min: 0, max: 51 },
  vp9: { min: 0, max: 63 },
  vp8: { min: 4, max: 63 },
};
