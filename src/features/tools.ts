// Tool registry: drives navigation, the homepage cards, upload suggestions and "Continue with another tool".
import {
  AudioLines,
  Crop,
  Eraser,
  Film,
  Image as ImageIcon,
  ImageDown,
  type LucideIcon,
  Maximize2,
  RefreshCw,
  Scissors,
  Shrink,
  Video,
  VolumeX,
} from 'lucide-react';
import { OPERATIONS, isAdvertised } from '@/lib/media/capabilities';
import type { MediaKind } from '@/lib/media/formats';

export interface ToolInfo {
  id: string;
  kind: 'image' | 'video';
  path: string;
  title: string;
  short: string;
  description: string;
  icon: LucideIcon;
  /** Capability-matrix operation that must be advertised for the tool to be listed. */
  operation: string;
  /** Kinds of files this tool accepts (GIF can be used in video tools). */
  accepts: MediaKind[];
  popular?: boolean;
}

export const TOOLS: ToolInfo[] = [
  {
    id: 'image-convert',
    kind: 'image',
    path: '/image/convert',
    title: 'Convert image',
    short: 'JPG, PNG, WebP, AVIF, GIF, BMP',
    description: 'Change an image to another format. Transparency is kept where the format supports it.',
    icon: RefreshCw,
    operation: 'image-convert',
    accepts: ['image'],
    popular: true,
  },
  {
    id: 'image-compress',
    kind: 'image',
    path: '/image/compress',
    title: 'Compress image',
    short: 'Smaller files, same look',
    description: 'Reduce file size with presets, a quality slider or a target size, and compare before and after.',
    icon: Shrink,
    operation: 'image-compress',
    accepts: ['image'],
    popular: true,
  },
  {
    id: 'image-crop',
    kind: 'image',
    path: '/image/crop',
    title: 'Crop & rotate image',
    short: 'Aspect ratios, rotate, flip',
    description: 'Crop to an exact area or aspect ratio, rotate and flip. Coordinates map to full-resolution pixels.',
    icon: Crop,
    operation: 'image-crop',
    accepts: ['image'],
    popular: true,
  },
  {
    id: 'image-resize',
    kind: 'image',
    path: '/image/resize',
    title: 'Resize image',
    short: 'Pixels or percentage',
    description: 'Resize to exact pixels or a percentage with high-quality Lanczos resampling.',
    icon: Maximize2,
    operation: 'image-resize',
    accepts: ['image'],
  },
  {
    id: 'image-remove-background',
    kind: 'image',
    path: '/image/remove-background',
    title: 'Remove background',
    short: 'AI cut-out, transparent PNG',
    description: 'Cut out the subject with an AI model that runs on your device, then keep a transparent or solid-colour background.',
    icon: Eraser,
    operation: 'image-remove-background',
    accepts: ['image'],
    popular: true,
  },
  {
    id: 'video-convert',
    kind: 'video',
    path: '/video/convert',
    title: 'Convert video',
    short: 'MP4, WebM, MOV',
    description: 'Convert to MP4, WebM or MOV, or just change the container without re-encoding.',
    icon: RefreshCw,
    operation: 'video-convert',
    accepts: ['video', 'image'],
    popular: true,
  },
  {
    id: 'video-compress',
    kind: 'video',
    path: '/video/compress',
    title: 'Compress video',
    short: 'Presets or target size',
    description: 'Shrink videos with quality presets, custom CRF/bitrate, or a target file size.',
    icon: Shrink,
    operation: 'video-compress',
    accepts: ['video'],
    popular: true,
  },
  {
    id: 'video-trim',
    kind: 'video',
    path: '/video/trim',
    title: 'Trim video',
    short: 'Fast or frame-accurate',
    description: 'Cut the start and end of a video, either instantly (keyframe) or frame-accurately.',
    icon: Scissors,
    operation: 'video-trim',
    accepts: ['video'],
    popular: true,
  },
  {
    id: 'video-crop',
    kind: 'video',
    path: '/video/crop',
    title: 'Crop video',
    short: 'Aspect ratios, output size',
    description: 'Crop the video frame to an area or aspect ratio and choose the output resolution.',
    icon: Crop,
    operation: 'video-crop',
    accepts: ['video'],
  },
  {
    id: 'video-resize',
    kind: 'video',
    path: '/video/resize',
    title: 'Resize & rotate video',
    short: 'Resolution, rotate, flip',
    description: 'Change the resolution, rotate in 90° steps, or flip the video.',
    icon: Maximize2,
    operation: 'video-resize',
    accepts: ['video'],
  },
  {
    id: 'video-extract-audio',
    kind: 'video',
    path: '/video/extract-audio',
    title: 'Extract audio',
    short: 'MP3, M4A, WAV, Opus',
    description: 'Save the soundtrack of a video as an audio file. Copies the stream without quality loss when possible.',
    icon: AudioLines,
    operation: 'video-extract-audio',
    accepts: ['video'],
  },
  {
    id: 'video-remove-audio',
    kind: 'video',
    path: '/video/remove-audio',
    title: 'Remove audio',
    short: 'Mute without re-encoding',
    description: 'Remove the sound from a video instantly, without re-encoding the picture.',
    icon: VolumeX,
    operation: 'video-remove-audio',
    accepts: ['video'],
  },
  {
    id: 'video-thumbnail',
    kind: 'video',
    path: '/video/thumbnail',
    title: 'Video thumbnail',
    short: 'Frame to JPG, PNG, WebP',
    description: 'Save the exact frame you see as an image.',
    icon: ImageDown,
    operation: 'video-thumbnail',
    accepts: ['video'],
  },
  {
    id: 'video-gif',
    kind: 'video',
    path: '/video/gif',
    title: 'Video to GIF',
    short: 'Short clips, good colours',
    description: 'Turn a short clip into an animated GIF with an optimised palette.',
    icon: Film,
    operation: 'video-gif',
    accepts: ['video'],
  },
];

export const availableTools = () => TOOLS.filter((t) => OPERATIONS.some((o) => o.id === t.operation && isAdvertised(o)));

export const toolById = (id: string) => TOOLS.find((t) => t.id === id);

export const toolsForKind = (kind: MediaKind) => availableTools().filter((t) => t.accepts.includes(kind) && (kind !== 'image' || t.kind === 'image'));

export const KIND_ICONS: Record<'image' | 'video', LucideIcon> = { image: ImageIcon, video: Video };
