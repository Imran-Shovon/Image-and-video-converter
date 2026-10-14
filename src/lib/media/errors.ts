// Error taxonomy (spec §10). Every failure shown to the user maps to one of these codes.

export const ERROR_CODES = [
  'UNSUPPORTED_FORMAT',
  'CORRUPTED_FILE',
  'EMPTY_FILE',
  'TOO_LARGE',
  'TOO_MANY_PIXELS',
  'TOO_LONG',
  'NO_AUDIO_TRACK',
  'NO_VIDEO_TRACK',
  'CODEC_UNAVAILABLE',
  'OUT_OF_MEMORY',
  'TIMEOUT',
  'CANCELLED',
  'ENCODER_FAILED',
  'VALIDATION_FAILED',
  'ENGINE_LOAD_FAILED',
  'NETWORK_ERROR',
  'SERVER_BUSY',
  'INVALID_SETTINGS',
] as const;

export type MediaErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorCopy {
  title: string;
  message: string;
  suggestion: string;
}

export const ERROR_COPY: Record<MediaErrorCode, ErrorCopy> = {
  UNSUPPORTED_FORMAT: {
    title: 'Unsupported format',
    message: "This file type isn't supported by this tool.",
    suggestion: 'Check the supported formats list, or convert the file first.',
  },
  CORRUPTED_FILE: {
    title: 'File could not be read',
    message: 'The file looks damaged or incomplete.',
    suggestion: 'Try exporting or downloading the file again.',
  },
  EMPTY_FILE: {
    title: 'Empty file',
    message: 'This file contains no data (0 bytes).',
    suggestion: 'Choose a different file.',
  },
  TOO_LARGE: {
    title: 'File too large',
    message: 'This file is larger than the limit for processing in your browser.',
    suggestion: 'Try a smaller file, or trim/compress it with another app first.',
  },
  TOO_MANY_PIXELS: {
    title: 'Image dimensions too large',
    message: 'This image has more pixels than can be processed safely on this device.',
    suggestion: 'Try a smaller image, or use a desktop browser.',
  },
  TOO_LONG: {
    title: 'Video too long',
    message: 'This video is longer than the limit for processing in your browser.',
    suggestion: 'Trim the video into shorter parts first.',
  },
  NO_AUDIO_TRACK: {
    title: 'No audio track',
    message: "This video doesn't contain any audio.",
    suggestion: 'Choose a video that has sound.',
  },
  NO_VIDEO_TRACK: {
    title: 'No video track',
    message: "This file doesn't contain a video stream.",
    suggestion: 'Choose a video file.',
  },
  CODEC_UNAVAILABLE: {
    title: 'Codec not available',
    message: "Your browser can't decode or encode this format.",
    suggestion: 'Try a different output format, or a different browser (see Browser limitations).',
  },
  OUT_OF_MEMORY: {
    title: 'Ran out of memory',
    message: 'The browser ran out of memory while processing this file.',
    suggestion: 'Try a lower resolution, a shorter clip, or close other tabs and retry.',
  },
  TIMEOUT: {
    title: 'Processing took too long',
    message: 'The job exceeded the time limit.',
    suggestion: 'Try a faster speed preset, a lower resolution, or a shorter clip.',
  },
  CANCELLED: {
    title: 'Cancelled',
    message: 'Processing was cancelled.',
    suggestion: 'Your file and settings are kept. Start again whenever you are ready.',
  },
  ENCODER_FAILED: {
    title: 'Processing failed',
    message: 'The encoder could not produce an output file with these settings.',
    suggestion: 'Try different settings or another output format.',
  },
  VALIDATION_FAILED: {
    title: 'Output check failed',
    message: "The processed file didn't pass verification, so it wasn't offered for download.",
    suggestion: 'Try different settings or another output format.',
  },
  ENGINE_LOAD_FAILED: {
    title: 'Processing engine failed to load',
    message: 'The media engine could not be downloaded or started.',
    suggestion: 'Check your connection and reload the page.',
  },
  NETWORK_ERROR: {
    title: 'Network error',
    message: 'A network request failed.',
    suggestion: 'Check your connection and try again.',
  },
  SERVER_BUSY: {
    title: 'Server busy',
    message: 'The processing server is busy right now.',
    suggestion: 'Please try again in a few minutes.',
  },
  INVALID_SETTINGS: {
    title: 'Invalid settings',
    message: 'Some settings are out of range.',
    suggestion: 'Check the highlighted settings and try again.',
  },
};

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  /** Optional user-facing detail that replaces the default message. Never raw engine output. */
  readonly detail?: string;

  constructor(code: MediaErrorCode, detail?: string, options?: { cause?: unknown }) {
    super(detail ?? ERROR_COPY[code].message, options);
    this.name = 'MediaError';
    this.code = code;
    this.detail = detail;
  }
}

export function isMediaError(value: unknown): value is MediaError {
  return (
    value instanceof MediaError ||
    (typeof value === 'object' &&
      value !== null &&
      'code' in value &&
      typeof (value as { code: unknown }).code === 'string' &&
      (ERROR_CODES as readonly string[]).includes((value as { code: string }).code))
  );
}

const OOM_PATTERNS = [/out of memory/i, /bad_alloc/i, /\bOOM\b/, /Cannot enlarge memory/i, /Array buffer allocation failed/i, /RangeError.*(memory|allocation)/i];

/** Normalises anything thrown by engines/workers into a MediaError. */
export function toMediaError(error: unknown, fallback: MediaErrorCode = 'ENCODER_FAILED'): MediaError {
  if (error instanceof MediaError) return error;
  if (isMediaError(error)) return new MediaError(error.code, error.detail);
  if (error instanceof DOMException && error.name === 'AbortError') return new MediaError('CANCELLED');
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (OOM_PATTERNS.some((re) => re.test(text))) return new MediaError('OUT_OF_MEMORY', undefined, { cause: error });
  return new MediaError(fallback, undefined, { cause: error });
}

/** Serialisable form used to pass errors across worker boundaries. */
export interface SerializedMediaError {
  code: MediaErrorCode;
  detail?: string;
}

export function serializeError(error: unknown): SerializedMediaError {
  const e = toMediaError(error);
  return { code: e.code, detail: e.detail };
}
