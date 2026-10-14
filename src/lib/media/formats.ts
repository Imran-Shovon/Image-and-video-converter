// Format identifiers and static metadata shared by detection, validation and the capability matrix.

export type MediaKind = 'image' | 'video' | 'audio';

export type ImageFormatId = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'bmp' | 'heic' | 'tiff' | 'ico' | 'svg';
export type VideoFormatId = 'mp4' | 'mov' | 'webm' | 'mkv' | 'm4v' | 'avi' | '3gp';
export type AudioFormatId = 'mp3' | 'm4a' | 'wav' | 'opus' | 'ogg';
/** Formats that are recognised only so they can be rejected with a specific message. */
export type RejectedFormatId = 'hls-playlist' | 'ffconcat';

export type FormatId = ImageFormatId | VideoFormatId | AudioFormatId;

export interface FormatInfo {
  id: FormatId;
  kind: MediaKind;
  label: string;
  /** Preferred extension first. */
  extensions: string[];
  mime: string;
}

export const FORMATS: Record<FormatId, FormatInfo> = {
  jpeg: { id: 'jpeg', kind: 'image', label: 'JPG', extensions: ['jpg', 'jpeg', 'jfif'], mime: 'image/jpeg' },
  png: { id: 'png', kind: 'image', label: 'PNG', extensions: ['png', 'apng'], mime: 'image/png' },
  webp: { id: 'webp', kind: 'image', label: 'WebP', extensions: ['webp'], mime: 'image/webp' },
  avif: { id: 'avif', kind: 'image', label: 'AVIF', extensions: ['avif'], mime: 'image/avif' },
  gif: { id: 'gif', kind: 'image', label: 'GIF', extensions: ['gif'], mime: 'image/gif' },
  bmp: { id: 'bmp', kind: 'image', label: 'BMP', extensions: ['bmp'], mime: 'image/bmp' },
  heic: { id: 'heic', kind: 'image', label: 'HEIC', extensions: ['heic', 'heif'], mime: 'image/heic' },
  tiff: { id: 'tiff', kind: 'image', label: 'TIFF', extensions: ['tif', 'tiff'], mime: 'image/tiff' },
  ico: { id: 'ico', kind: 'image', label: 'ICO', extensions: ['ico'], mime: 'image/x-icon' },
  svg: { id: 'svg', kind: 'image', label: 'SVG', extensions: ['svg'], mime: 'image/svg+xml' },
  mp4: { id: 'mp4', kind: 'video', label: 'MP4', extensions: ['mp4'], mime: 'video/mp4' },
  mov: { id: 'mov', kind: 'video', label: 'MOV', extensions: ['mov', 'qt'], mime: 'video/quicktime' },
  webm: { id: 'webm', kind: 'video', label: 'WebM', extensions: ['webm'], mime: 'video/webm' },
  mkv: { id: 'mkv', kind: 'video', label: 'MKV', extensions: ['mkv'], mime: 'video/x-matroska' },
  m4v: { id: 'm4v', kind: 'video', label: 'M4V', extensions: ['m4v'], mime: 'video/x-m4v' },
  avi: { id: 'avi', kind: 'video', label: 'AVI', extensions: ['avi'], mime: 'video/x-msvideo' },
  '3gp': { id: '3gp', kind: 'video', label: '3GP', extensions: ['3gp'], mime: 'video/3gpp' },
  mp3: { id: 'mp3', kind: 'audio', label: 'MP3', extensions: ['mp3'], mime: 'audio/mpeg' },
  m4a: { id: 'm4a', kind: 'audio', label: 'M4A (AAC)', extensions: ['m4a'], mime: 'audio/mp4' },
  wav: { id: 'wav', kind: 'audio', label: 'WAV', extensions: ['wav'], mime: 'audio/wav' },
  opus: { id: 'opus', kind: 'audio', label: 'Opus', extensions: ['opus'], mime: 'audio/ogg; codecs=opus' },
  ogg: { id: 'ogg', kind: 'audio', label: 'Ogg', extensions: ['ogg', 'oga'], mime: 'audio/ogg' },
};

export function formatLabel(id: FormatId): string {
  return FORMATS[id].label;
}

export function primaryExtension(id: FormatId): string {
  return FORMATS[id].extensions[0] ?? id;
}
