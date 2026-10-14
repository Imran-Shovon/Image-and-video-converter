// Capability matrix: the single source of truth for formats and operations (spec §2.2).
// The UI (format pickers, homepage lists, FAQ) and docs/SUPPORTED_FORMATS.md are generated from this file.
// Only entries with an advertised status are offered to users.
import type { AudioFormatId, ImageFormatId, VideoFormatId } from './formats';

export type Engine = 'canvas' | 'wasm-codec' | 'custom' | 'ffmpeg-wasm' | 'webcodecs' | 'webgpu-ml' | 'server';

/**
 * - tested: implemented and covered by automated tests in a real browser.
 * - browser-dependent: implemented; works only where the browser provides the decoder (checked at runtime).
 * - implemented: code exists but is not yet covered by browser tests; not advertised.
 * - planned / unsupported: not available; listed for documentation only.
 */
export type CapabilityStatus = 'tested' | 'browser-dependent' | 'implemented' | 'planned' | 'unsupported';

export const ADVERTISED: ReadonlySet<CapabilityStatus> = new Set(['tested', 'browser-dependent']);

export interface ImageInputCapability {
  format: ImageFormatId;
  decode: Engine[];
  status: CapabilityStatus;
  notes?: string;
}

export type ImageOutputFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'bmp';

export interface ImageOutputCapability {
  format: ImageOutputFormat;
  engine: Engine;
  library: string;
  lossy: boolean;
  transparency: boolean;
  status: CapabilityStatus;
  notes?: string;
}

export type VideoOutputId = 'mp4-h264' | 'mp4-h265' | 'webm-vp9' | 'webm-vp8' | 'mov-h264' | 'gif';

export interface VideoOutputCapability {
  id: VideoOutputId;
  label: string;
  container: 'mp4' | 'webm' | 'mov' | 'gif';
  videoCodec: 'h264' | 'h265' | 'vp9' | 'vp8' | 'gif';
  audioCodec: 'aac' | 'opus' | 'vorbis' | null;
  engines: Engine[];
  status: CapabilityStatus;
  notes?: string;
}

export interface VideoInputCapability {
  format: VideoFormatId;
  status: CapabilityStatus;
  notes?: string;
}

export interface AudioOutputCapability {
  format: Extract<AudioFormatId, 'mp3' | 'm4a' | 'wav' | 'opus'>;
  codec: string;
  engine: Engine;
  status: CapabilityStatus;
  notes?: string;
}

export interface OperationCapability {
  id: string;
  kind: 'image' | 'video';
  label: string;
  engines: Engine[];
  status: CapabilityStatus;
  notes?: string;
}

export const IMAGE_INPUTS: ImageInputCapability[] = [
  { format: 'jpeg', decode: ['canvas'], status: 'tested', notes: 'EXIF orientation applied before any transform. CMYK decodes where the browser supports it.' },
  { format: 'png', decode: ['canvas'], status: 'tested', notes: 'Animated PNG: first frame only.' },
  { format: 'webp', decode: ['canvas'], status: 'tested', notes: 'Animated WebP: first frame only.' },
  { format: 'avif', decode: ['canvas', 'wasm-codec'], status: 'tested', notes: 'Falls back to the libavif WASM decoder when the browser cannot decode AVIF.' },
  { format: 'gif', decode: ['canvas'], status: 'tested', notes: 'Animated GIF: first frame only in image tools; use Video → Convert to keep the animation.' },
  { format: 'bmp', decode: ['canvas'], status: 'tested' },
  { format: 'heic', decode: ['canvas'], status: 'browser-dependent', notes: 'Decoded only by browsers with native HEIC support (Safari 17+).' },
  { format: 'tiff', decode: ['canvas'], status: 'browser-dependent', notes: 'Decoded only by browsers with native TIFF support (Safari).' },
  { format: 'ico', decode: ['canvas'], status: 'browser-dependent' },
  { format: 'svg', decode: [], status: 'unsupported', notes: 'Rejected: SVG can contain scripts, and workers cannot rasterize it safely.' },
];

export const IMAGE_OUTPUTS: ImageOutputCapability[] = [
  { format: 'jpeg', engine: 'wasm-codec', library: 'MozJPEG (jSquash)', lossy: true, transparency: false, status: 'tested', notes: 'Transparent areas are filled with a background colour you choose.' },
  { format: 'png', engine: 'wasm-codec', library: 'OxiPNG (jSquash) + gifenc quantizer', lossy: false, transparency: true, status: 'tested', notes: 'Lossless optimisation, or lossy palette reduction (2–256 colours).' },
  { format: 'webp', engine: 'wasm-codec', library: 'libwebp (jSquash)', lossy: true, transparency: true, status: 'tested' },
  { format: 'avif', engine: 'wasm-codec', library: 'libavif (jSquash)', lossy: true, transparency: true, status: 'tested', notes: 'Encoding is slow for large images.' },
  { format: 'gif', engine: 'custom', library: 'gifenc', lossy: true, transparency: true, status: 'tested', notes: 'Limited to 256 colours; 1-bit transparency.' },
  { format: 'bmp', engine: 'custom', library: 'built-in 24-bit encoder', lossy: false, transparency: false, status: 'tested', notes: 'Uncompressed 24-bit. Transparent areas are filled with a background colour.' },
];

export const VIDEO_INPUTS: VideoInputCapability[] = [
  { format: 'mp4', status: 'tested', notes: 'H.264, H.265/HEVC, VP9 and AV1 video; AAC, MP3, Opus audio.' },
  { format: 'mov', status: 'tested', notes: 'ProRes and HEVC may need a preview proxy in Chrome/Firefox.' },
  { format: 'webm', status: 'tested', notes: 'VP8, VP9, AV1 with Opus/Vorbis audio.' },
  { format: 'mkv', status: 'tested', notes: 'Browsers cannot play MKV directly; a preview proxy is generated.' },
  { format: 'm4v', status: 'tested' },
  { format: 'avi', status: 'implemented', notes: 'Decoded by ffmpeg.wasm; a preview proxy is generated.' },
  { format: '3gp', status: 'implemented' },
];

export const VIDEO_OUTPUTS: VideoOutputCapability[] = [
  { id: 'mp4-h264', label: 'MP4 (H.264 + AAC)', container: 'mp4', videoCodec: 'h264', audioCodec: 'aac', engines: ['webcodecs', 'ffmpeg-wasm'], status: 'tested', notes: 'yuv420p with +faststart for web playback. Plays everywhere.' },
  { id: 'webm-vp9', label: 'WebM (VP9 + Opus)', container: 'webm', videoCodec: 'vp9', audioCodec: 'opus', engines: ['webcodecs'], status: 'browser-dependent', notes: 'Encoded with your browser’s WebCodecs VP9 encoder (Chrome, Edge, Firefox). The ffmpeg.wasm VP9 encoder crashes in this build, so it is not used.' },
  { id: 'webm-vp8', label: 'WebM (VP8 + Vorbis)', container: 'webm', videoCodec: 'vp8', audioCodec: 'vorbis', engines: ['ffmpeg-wasm'], status: 'tested' },
  { id: 'mov-h264', label: 'MOV (H.264 + AAC)', container: 'mov', videoCodec: 'h264', audioCodec: 'aac', engines: ['ffmpeg-wasm'], status: 'tested' },
  { id: 'mp4-h265', label: 'MP4 (H.265/HEVC + AAC)', container: 'mp4', videoCodec: 'h265', audioCodec: 'aac', engines: [], status: 'unsupported', notes: 'The ffmpeg.wasm x265 encoder does not finish in the browser. HEVC input is supported.' },
  { id: 'gif', label: 'Animated GIF', container: 'gif', videoCodec: 'gif', audioCodec: null, engines: ['ffmpeg-wasm'], status: 'tested', notes: 'Two-pass palette; for short clips only.' },
];

export const AUDIO_OUTPUTS: AudioOutputCapability[] = [
  { format: 'mp3', codec: 'MP3 (LAME)', engine: 'ffmpeg-wasm', status: 'tested' },
  { format: 'm4a', codec: 'AAC', engine: 'ffmpeg-wasm', status: 'tested', notes: 'Stream copy when the source audio is already AAC.' },
  { format: 'wav', codec: 'PCM 16-bit', engine: 'ffmpeg-wasm', status: 'tested' },
  { format: 'opus', codec: 'Opus', engine: 'ffmpeg-wasm', status: 'tested', notes: 'Stream copy when the source audio is already Opus.' },
];

export const OPERATIONS: OperationCapability[] = [
  { id: 'image-convert', kind: 'image', label: 'Convert image format', engines: ['canvas', 'wasm-codec', 'custom'], status: 'tested' },
  { id: 'image-compress', kind: 'image', label: 'Compress image (presets, quality, target size)', engines: ['wasm-codec'], status: 'tested' },
  { id: 'image-crop', kind: 'image', label: 'Crop, rotate and flip image', engines: ['canvas'], status: 'tested' },
  { id: 'image-resize', kind: 'image', label: 'Resize image (Lanczos3)', engines: ['wasm-codec'], status: 'tested' },
  {
    id: 'image-remove-background',
    kind: 'image',
    label: 'Remove background (AI, on device)',
    engines: ['webgpu-ml', 'canvas', 'wasm-codec'],
    status: 'browser-dependent',
    notes: 'BiRefNet-lite (MIT) via onnxruntime-web on WebGPU; one-time model download of about 115 MB (224 MB on GPUs without 16-bit float support). Not available without WebGPU.',
  },
  { id: 'image-batch', kind: 'image', label: 'Batch processing and ZIP download', engines: ['canvas', 'wasm-codec'], status: 'tested' },
  { id: 'image-keep-metadata', kind: 'image', label: 'Keep EXIF/ICC metadata', engines: [], status: 'unsupported', notes: 'Client-side re-encoding always strips metadata; colours are converted to sRGB.' },
  { id: 'image-animated', kind: 'image', label: 'Preserve animation in image tools', engines: [], status: 'planned', notes: 'Image tools process the first frame. Video → Convert keeps GIF animation.' },
  { id: 'video-convert', kind: 'video', label: 'Convert video (re-encode)', engines: ['webcodecs', 'ffmpeg-wasm'], status: 'tested' },
  { id: 'video-remux', kind: 'video', label: 'Change container only (stream copy)', engines: ['ffmpeg-wasm'], status: 'tested' },
  { id: 'video-compress', kind: 'video', label: 'Compress video (CRF presets, target size)', engines: ['webcodecs', 'ffmpeg-wasm'], status: 'tested' },
  { id: 'video-crop', kind: 'video', label: 'Crop video', engines: ['webcodecs', 'ffmpeg-wasm'], status: 'tested' },
  { id: 'video-trim', kind: 'video', label: 'Trim video (fast and precise)', engines: ['ffmpeg-wasm'], status: 'tested' },
  { id: 'video-resize', kind: 'video', label: 'Resize, rotate and flip video', engines: ['webcodecs', 'ffmpeg-wasm'], status: 'tested' },
  { id: 'video-extract-audio', kind: 'video', label: 'Extract audio', engines: ['ffmpeg-wasm'], status: 'tested' },
  { id: 'video-remove-audio', kind: 'video', label: 'Remove audio', engines: ['ffmpeg-wasm'], status: 'tested' },
  { id: 'video-thumbnail', kind: 'video', label: 'Thumbnail from a frame', engines: ['ffmpeg-wasm', 'wasm-codec'], status: 'tested' },
  { id: 'video-gif', kind: 'video', label: 'GIF from a clip', engines: ['ffmpeg-wasm'], status: 'tested' },
  { id: 'video-av1-encode', kind: 'video', label: 'AV1 encoding', engines: [], status: 'unsupported', notes: 'The ffmpeg.wasm build has no AV1 encoder; WebCodecs AV1 encoding is not exposed yet.' },
  { id: 'server-processing', kind: 'video', label: 'Server-side processing', engines: ['server'], status: 'planned', notes: 'Disabled in this release (ENABLE_SERVER_PROCESSING=false).' },
];

export const isAdvertised = (c: { status: CapabilityStatus }) => ADVERTISED.has(c.status);

export const advertisedImageOutputs = () => IMAGE_OUTPUTS.filter(isAdvertised);
export const advertisedImageInputs = () => IMAGE_INPUTS.filter(isAdvertised);
export const advertisedVideoOutputs = () => VIDEO_OUTPUTS.filter(isAdvertised);
export const advertisedVideoInputs = () => VIDEO_INPUTS.filter(isAdvertised);
export const advertisedAudioOutputs = () => AUDIO_OUTPUTS.filter(isAdvertised);

export function imageOutputCapability(format: ImageOutputFormat): ImageOutputCapability {
  const cap = IMAGE_OUTPUTS.find((c) => c.format === format);
  if (!cap) throw new Error(`Unknown image output ${format}`);
  return cap;
}

export function videoOutputCapability(id: VideoOutputId): VideoOutputCapability {
  const cap = VIDEO_OUTPUTS.find((c) => c.id === id);
  if (!cap) throw new Error(`Unknown video output ${id}`);
  return cap;
}

/** Image formats accepted by the image tools' file pickers (including browser-dependent ones). */
export function acceptedImageFormats(): ImageFormatId[] {
  return IMAGE_INPUTS.filter((c) => c.status !== 'unsupported' && c.status !== 'planned').map((c) => c.format);
}

/** Video formats accepted by the video tools (implemented inputs are decoded by ffmpeg.wasm even if not yet advertised). */
export function acceptedVideoFormats(): VideoFormatId[] {
  return VIDEO_INPUTS.filter((c) => c.status !== 'unsupported' && c.status !== 'planned').map((c) => c.format);
}
