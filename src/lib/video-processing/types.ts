import type { VideoOutputId } from '@/lib/media/capabilities';

export type { VideoOutputId };

export interface VideoStreamInfo {
  codec: string;
  /** Display dimensions (rotation metadata applied). */
  width: number;
  height: number;
  codedWidth: number;
  codedHeight: number;
  /** Rotation metadata in degrees clockwise (0, 90, 180, 270). */
  rotation: number;
  fps: number | null;
  /** True when the stream looks variable-frame-rate. */
  vfr: boolean;
  pixFmt: string | null;
  bitrateKbps: number | null;
}

export interface AudioStreamInfo {
  codec: string;
  channels: number | null;
  sampleRate: number | null;
  bitrateKbps: number | null;
}

export interface VideoProbe {
  container: string;
  durationSec: number | null;
  bitrateKbps: number | null;
  video: VideoStreamInfo | null;
  audio: AudioStreamInfo | null;
  videoStreams: number;
  audioStreams: number;
  subtitleStreams: number;
  source: 'mediabunny' | 'ffmpeg';
}

export interface TrimRange {
  start: number;
  end: number;
}

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** Geometry and timing changes, applied in one pass: trim → crop → rotate/flip → scale → fps. */
export interface VideoTransform {
  trim?: TrimRange;
  /** In displayed-orientation pixels of the source. */
  crop?: CropBox;
  rotate?: Rotation;
  flipH?: boolean;
  flipV?: boolean;
  /** Output size after rotation. Omit one side to keep the aspect ratio. */
  scale?: { width?: number; height?: number };
  fps?: number;
}

export type SpeedPreset = 'ultrafast' | 'veryfast' | 'faster' | 'medium' | 'slow';

export type RateControl = { mode: 'crf'; crf: number } | { mode: 'bitrate'; videoKbps: number; twoPass: boolean };

export type AudioSettings = { mode: 'encode'; bitrateKbps: number } | { mode: 'remove' };

export interface EncodeJob {
  type: 'encode';
  output: Exclude<VideoOutputId, 'gif'>;
  transform: VideoTransform;
  rate: RateControl;
  speed: SpeedPreset;
  audio: AudioSettings;
}

export interface RemuxJob {
  type: 'remux';
  container: 'mp4' | 'mov' | 'webm' | 'mkv';
  /** Fast trim: cut points snap to keyframes. */
  trim?: TrimRange;
  removeAudio?: boolean;
}

export type AudioOutputFormat = 'mp3' | 'm4a' | 'wav' | 'opus';

export interface ExtractAudioJob {
  type: 'extract-audio';
  format: AudioOutputFormat;
  bitrateKbps: number;
  /** Copy the stream without re-encoding when the source codec already fits. */
  allowCopy: boolean;
  trim?: TrimRange;
}

export interface ThumbnailJob {
  type: 'thumbnail';
  time: number;
}

export interface GifJob {
  type: 'gif';
  start: number;
  duration: number;
  fps: number;
  width: number;
  loop: boolean;
  crop?: CropBox;
}

export type VideoJob = EncodeJob | RemuxJob | ExtractAudioJob | ThumbnailJob | GifJob;

export interface VideoProgress {
  stage: 'loading-engine' | 'probing' | 'processing' | 'verifying';
  /** 0–1, or null when unknown (show an indeterminate indicator). */
  fraction: number | null;
  message?: string;
}

export interface VideoJobResult {
  blob: Blob;
  filenameExt: string;
  mime: string;
  bytes: number;
  probe: VideoProbe | null;
  engine: 'ffmpeg-wasm' | 'webcodecs';
  notes: string[];
}
