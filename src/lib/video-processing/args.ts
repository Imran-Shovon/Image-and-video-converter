// Pure FFmpeg argument builders (spec §14). Every user setting arrives as a validated enum or number;
// nothing is passed through as a raw string. Builders return argument arrays, never shell strings.
import { videoOutputCapability } from '@/lib/media/capabilities';
import { MediaError } from '@/lib/media/errors';
import { floorEven } from '@/lib/image-processing/geometry';
import { codecForOutput, CRF_RANGE } from './presets';
import type {
  AudioOutputFormat,
  CropBox,
  EncodeJob,
  ExtractAudioJob,
  GifJob,
  RemuxJob,
  SpeedPreset,
  ThumbnailJob,
  VideoJob,
  VideoProbe,
  VideoTransform,
} from './types';

export interface PlanContext {
  /** Path of the mounted input file inside the FFmpeg filesystem. */
  input: string;
  /** Directory for outputs and pass logs. */
  workDir: string;
  probe: VideoProbe;
}

export interface OutputExpectation {
  video: boolean;
  audio: boolean;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  /** Allowed absolute duration difference in seconds. */
  durationTolerance: number;
  /** Expected leading bytes check (format id from detect.ts). */
  format: 'mp4' | 'mov' | 'webm' | 'mkv' | 'gif' | 'mp3' | 'm4a' | 'wav' | 'opus' | 'png';
}

export interface FfmpegPlan {
  passes: string[][];
  /** Relative weight of each pass for progress reporting. */
  passWeights: number[];
  output: string;
  ext: string;
  mime: string;
  /** Duration processed per pass, for progress (seconds of input). */
  progressDuration: number | null;
  expect: OutputExpectation;
  notes: string[];
}

const fmt = (n: number) => Number(n.toFixed(3)).toString();
const int = (n: number, lo: number, hi: number) => {
  if (!Number.isFinite(n)) throw new MediaError('INVALID_SETTINGS');
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

function requireVideo(probe: VideoProbe) {
  if (!probe.video) throw new MediaError('NO_VIDEO_TRACK');
  return probe.video;
}

export function trimDuration(probe: VideoProbe, trim?: { start: number; end: number }): number | null {
  if (trim) return Math.max(0, trim.end - trim.start);
  return probe.durationSec;
}

function validateTrim(probe: VideoProbe, trim?: { start: number; end: number }) {
  if (!trim) return;
  const max = probe.durationSec ?? Number.POSITIVE_INFINITY;
  if (!(trim.start >= 0 && trim.end > trim.start && trim.start < max)) {
    throw new MediaError('INVALID_SETTINGS', 'The trim range is invalid: the end must be after the start and within the video.');
  }
}

/** Snaps a crop box to even values inside the frame (required for yuv420p). */
export function snapCrop(crop: CropBox, frameWidth: number, frameHeight: number): CropBox {
  const width = Math.min(floorEven(crop.width), floorEven(frameWidth));
  const height = Math.min(floorEven(crop.height), floorEven(frameHeight));
  const x = Math.min(Math.max(0, Math.round(crop.x / 2) * 2), frameWidth - width);
  const y = Math.min(Math.max(0, Math.round(crop.y / 2) * 2), frameHeight - height);
  return { x: Math.max(0, x - (x % 2)), y: Math.max(0, y - (y % 2)), width, height };
}

export interface GeometryPlan {
  filters: string[];
  width: number;
  height: number;
  notes: string[];
}

/** Builds the crop → rotate/flip → scale → fps filter chain and the resulting output size. */
export function buildGeometry(probe: VideoProbe, t: VideoTransform, evenDimensions: boolean): GeometryPlan {
  const video = requireVideo(probe);
  const filters: string[] = [];
  const notes: string[] = [];
  let width = video.width;
  let height = video.height;

  if (t.crop) {
    const snapped = evenDimensions ? snapCrop(t.crop, width, height) : t.crop;
    if (
      evenDimensions &&
      (snapped.width !== Math.round(t.crop.width) || snapped.height !== Math.round(t.crop.height) || snapped.x !== Math.round(t.crop.x) || snapped.y !== Math.round(t.crop.y))
    ) {
      notes.push(`Crop adjusted to ${snapped.width}×${snapped.height} at (${snapped.x}, ${snapped.y}) because this codec needs even dimensions.`);
    }
    const c = { x: int(snapped.x, 0, width), y: int(snapped.y, 0, height), w: int(snapped.width, 2, width), h: int(snapped.height, 2, height) };
    filters.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`);
    width = c.w;
    height = c.h;
  }

  switch (t.rotate ?? 0) {
    case 90:
      filters.push('transpose=1');
      [width, height] = [height, width];
      break;
    case 180:
      filters.push('hflip', 'vflip');
      break;
    case 270:
      filters.push('transpose=2');
      [width, height] = [height, width];
      break;
  }
  if (t.flipH) filters.push('hflip');
  if (t.flipV) filters.push('vflip');

  let outW = width;
  let outH = height;
  if (t.scale && (t.scale.width || t.scale.height)) {
    const aspect = width / height;
    outW = t.scale.width ? t.scale.width : t.scale.height! * aspect;
    outH = t.scale.height ? t.scale.height : t.scale.width! / aspect;
  }
  outW = Math.max(evenDimensions ? 2 : 1, Math.round(outW));
  outH = Math.max(evenDimensions ? 2 : 1, Math.round(outH));
  if (evenDimensions) {
    const evenW = floorEven(outW);
    const evenH = floorEven(outH);
    if ((evenW !== outW || evenH !== outH) && t.scale) notes.push(`Output size adjusted to ${evenW}×${evenH} (even dimensions required).`);
    outW = evenW;
    outH = evenH;
  }
  if (outW !== width || outH !== height) filters.push(`scale=${outW}:${outH}:flags=lanczos`);
  if (t.fps) filters.push(`fps=${int(t.fps, 1, 120)}`);

  return { filters, width: outW, height: outH, notes };
}

function x264Preset(speed: SpeedPreset): string {
  return speed;
}

/** libvpx speed flags. The realtime deadline is single-pass only, so two-pass encodes use 'good'. */
function vpxSpeed(speed: SpeedPreset, twoPass: boolean): string[] {
  if (twoPass && (speed === 'ultrafast' || speed === 'veryfast')) return ['-deadline', 'good', '-cpu-used', '5'];
  switch (speed) {
    case 'ultrafast':
      return ['-deadline', 'realtime', '-cpu-used', '8'];
    case 'veryfast':
      return ['-deadline', 'realtime', '-cpu-used', '6'];
    case 'faster':
      return ['-deadline', 'good', '-cpu-used', '5'];
    case 'medium':
      return ['-deadline', 'good', '-cpu-used', '3'];
    case 'slow':
      return ['-deadline', 'good', '-cpu-used', '1'];
  }
}

const STRIP_EXTRAS = ['-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1'];

export function buildEncodePlan(job: EncodeJob, ctx: PlanContext): FfmpegPlan {
  const { probe } = ctx;
  validateTrim(probe, job.transform.trim);
  const cap = videoOutputCapability(job.output);
  const codec = codecForOutput(job.output);
  const geometry = buildGeometry(probe, job.transform, true);
  const notes = [...geometry.notes];
  const duration = trimDuration(probe, job.transform.trim);
  const ext = cap.container;
  const output = `${ctx.workDir}/output.${ext}`;
  const hasAudio = job.audio.mode === 'encode' && probe.audio !== null;

  const inputArgs: string[] = ['-hide_banner', '-nostdin', '-y'];
  if (job.transform.trim) inputArgs.push('-ss', fmt(job.transform.trim.start));
  inputArgs.push('-i', ctx.input);
  if (job.transform.trim) inputArgs.push('-t', fmt(job.transform.trim.end - job.transform.trim.start));

  const filters = [...geometry.filters, 'format=yuv420p'];
  const mapArgs = ['-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0'] : ['-an']), ...STRIP_EXTRAS];
  // Variable-frame-rate sources keep their timestamps unless the user picks a fixed frame rate.
  const fpsMode = job.transform.fps ? [] : ['-fps_mode', 'passthrough'];
  if (probe.video?.vfr && !job.transform.fps) notes.push('Variable frame rate detected: original timestamps are kept.');

  const range = CRF_RANGE[codec];
  const passLog = `${ctx.workDir}/pass`;
  const twoPass = job.rate.mode === 'bitrate' && job.rate.twoPass && codec !== 'h265';
  const rateArgs = (pass?: 1 | 2): string[] => {
    if (job.rate.mode === 'crf') {
      const crf = int(job.rate.crf, range.min, range.max);
      if (codec === 'vp9') return ['-crf', String(crf), '-b:v', '0'];
      if (codec === 'vp8') return ['-crf', String(crf), '-b:v', '25M'];
      return ['-crf', String(crf)];
    }
    const kbps = int(job.rate.videoKbps, 50, 100_000);
    const base = ['-b:v', `${kbps}k`];
    if (pass) {
      if (codec === 'h265') return base;
      return [...base, '-pass', String(pass), '-passlogfile', passLog];
    }
    return [...base, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`];
  };

  const codecArgs = (pass?: 1 | 2): string[] => {
    switch (codec) {
      case 'h264':
        return ['-c:v', 'libx264', '-preset', x264Preset(job.speed), ...rateArgs(pass)];
      case 'h265':
        return ['-c:v', 'libx265', '-preset', x264Preset(job.speed), ...rateArgs(pass), '-tag:v', 'hvc1'];
      case 'vp9':
        return ['-c:v', 'libvpx-vp9', ...vpxSpeed(job.speed, twoPass), '-row-mt', '1', ...rateArgs(pass)];
      case 'vp8':
        return ['-c:v', 'libvpx', ...vpxSpeed(job.speed, twoPass), ...rateArgs(pass)];
    }
  };

  const videoArgs = codecArgs(twoPass ? 2 : undefined);
  const audioArgs: string[] = [];
  if (hasAudio && job.audio.mode === 'encode') {
    const kbps = String(int(job.audio.bitrateKbps, 32, 320));
    if (cap.audioCodec === 'aac') audioArgs.push('-c:a', 'aac', '-b:a', `${kbps}k`);
    else if (cap.audioCodec === 'opus') audioArgs.push('-c:a', 'libopus', '-b:a', `${kbps}k`);
    else if (cap.audioCodec === 'vorbis') audioArgs.push('-c:a', 'libvorbis', '-b:a', `${kbps}k`);
  }
  if (job.audio.mode === 'remove') notes.push('Audio removed.');
  else if (!probe.audio) notes.push('The source has no audio track.');
  if (probe.audioStreams > 1) notes.push(`Only the first of ${probe.audioStreams} audio tracks was kept.`);
  if (probe.subtitleStreams > 0) notes.push('Subtitles, chapters and metadata were removed.');

  const muxArgs = ext === 'mp4' || ext === 'mov' ? ['-movflags', '+faststart'] : [];
  const vf = ['-vf', filters.join(',')];

  const passes: string[][] = [];
  if (twoPass) {
    passes.push([...inputArgs, '-map', '0:v:0', '-an', ...STRIP_EXTRAS, ...vf, ...fpsMode, ...codecArgs(1), '-f', 'null', '/dev/null']);
  }
  passes.push([...inputArgs, ...mapArgs, ...vf, ...fpsMode, ...videoArgs, ...audioArgs, ...muxArgs, output]);

  return {
    passes,
    passWeights: twoPass ? [0.4, 0.6] : [1],
    output,
    ext,
    mime: ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4',
    progressDuration: duration,
    expect: {
      video: true,
      audio: hasAudio,
      width: geometry.width,
      height: geometry.height,
      durationSec: duration,
      durationTolerance: 0.15,
      format: ext as OutputExpectation['format'],
    },
    notes,
  };
}

const REMUX_VIDEO: Record<RemuxJob['container'], string[]> = {
  mp4: ['h264', 'hevc', 'av1', 'mpeg4', 'vp9'],
  mov: ['h264', 'hevc', 'mpeg4', 'prores', 'mjpeg'],
  webm: ['vp8', 'vp9', 'av1'],
  mkv: ['h264', 'hevc', 'av1', 'vp8', 'vp9', 'mpeg4', 'prores', 'mjpeg', 'theora'],
};
const REMUX_AUDIO: Record<RemuxJob['container'], string[]> = {
  mp4: ['aac', 'mp3', 'alac', 'opus', 'ac3', 'eac3', 'flac'],
  mov: ['aac', 'mp3', 'alac', 'pcm_s16le', 'pcm_s24le', 'ac3'],
  webm: ['opus', 'vorbis'],
  mkv: ['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3', 'eac3', 'dts', 'pcm_s16le', 'alac'],
};

/** Whether the source streams can be copied into `container` without re-encoding. */
export function canRemux(probe: VideoProbe, container: RemuxJob['container'], removeAudio = false): boolean {
  if (!probe.video) return false;
  if (!REMUX_VIDEO[container].includes(probe.video.codec)) return false;
  if (!removeAudio && probe.audio && !REMUX_AUDIO[container].includes(probe.audio.codec)) return false;
  return true;
}

export function buildRemuxPlan(job: RemuxJob, ctx: PlanContext): FfmpegPlan {
  const { probe } = ctx;
  validateTrim(probe, job.trim);
  if (!canRemux(probe, job.container, job.removeAudio)) {
    throw new MediaError('CODEC_UNAVAILABLE', `The streams in this file can't be copied into ${job.container.toUpperCase()} without re-encoding.`);
  }
  const output = `${ctx.workDir}/output.${job.container}`;
  const args = ['-hide_banner', '-nostdin', '-y'];
  if (job.trim) args.push('-ss', fmt(job.trim.start), '-to', fmt(job.trim.end));
  args.push('-i', ctx.input, '-map', '0:v:0');
  const keepAudio = !job.removeAudio && probe.audio !== null;
  if (keepAudio) args.push('-map', '0:a:0');
  else args.push('-an');
  args.push('-c', 'copy', ...STRIP_EXTRAS);
  if (job.trim) args.push('-avoid_negative_ts', 'make_zero');
  if (probe.video?.codec === 'hevc' && (job.container === 'mp4' || job.container === 'mov')) args.push('-tag:v', 'hvc1');
  if (job.container === 'mp4' || job.container === 'mov') args.push('-movflags', '+faststart');
  args.push(output);

  const notes: string[] = [];
  if (job.trim) notes.push('Fast trim copies the streams, so the cut points snap to the nearest keyframes and may shift slightly.');
  if (job.removeAudio) notes.push('Audio removed without re-encoding the video.');
  const duration = trimDuration(probe, job.trim);
  return {
    passes: [args],
    passWeights: [1],
    output,
    ext: job.container,
    mime: job.container === 'webm' ? 'video/webm' : job.container === 'mov' ? 'video/quicktime' : job.container === 'mkv' ? 'video/x-matroska' : 'video/mp4',
    progressDuration: duration,
    expect: {
      video: true,
      audio: keepAudio,
      width: probe.video?.width ?? null,
      height: probe.video?.height ?? null,
      durationSec: duration,
      // Keyframe snapping can move each cut point by up to a GOP (often 2–10 s).
      durationTolerance: job.trim ? Math.max(10, (duration ?? 0) * 0.5) : 0.5,
      format: job.container,
    },
    notes,
  };
}

const AUDIO_COPY_SOURCE: Record<AudioOutputFormat, string[]> = { mp3: ['mp3'], m4a: ['aac'], wav: ['pcm_s16le'], opus: ['opus'] };

export function buildExtractAudioPlan(job: ExtractAudioJob, ctx: PlanContext): FfmpegPlan {
  const { probe } = ctx;
  if (!probe.audio) throw new MediaError('NO_AUDIO_TRACK');
  validateTrim(probe, job.trim);
  const copy = job.allowCopy && AUDIO_COPY_SOURCE[job.format].includes(probe.audio.codec);
  const output = `${ctx.workDir}/output.${job.format}`;
  const kbps = `${int(job.bitrateKbps, 32, 320)}k`;
  const args = ['-hide_banner', '-nostdin', '-y'];
  if (job.trim) args.push('-ss', fmt(job.trim.start));
  args.push('-i', ctx.input);
  if (job.trim) args.push('-t', fmt(job.trim.end - job.trim.start));
  args.push('-map', '0:a:0', '-vn', ...STRIP_EXTRAS);
  if (copy) args.push('-c:a', 'copy');
  else {
    switch (job.format) {
      case 'mp3':
        args.push('-c:a', 'libmp3lame', '-b:a', kbps);
        break;
      case 'm4a':
        args.push('-c:a', 'aac', '-b:a', kbps);
        break;
      case 'wav':
        args.push('-c:a', 'pcm_s16le');
        break;
      case 'opus':
        args.push('-c:a', 'libopus', '-b:a', kbps);
        break;
    }
  }
  if (job.format === 'm4a') args.push('-movflags', '+faststart');
  args.push(output);
  const duration = trimDuration(probe, job.trim);
  const mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', opus: 'audio/ogg' }[job.format];
  return {
    passes: [args],
    passWeights: [1],
    output,
    ext: job.format,
    mime,
    progressDuration: duration,
    expect: { video: false, audio: true, width: null, height: null, durationSec: duration, durationTolerance: copy ? 0.5 : 0.2, format: job.format },
    notes: copy ? ['Audio copied without re-encoding (no quality loss).'] : [],
  };
}

/** Snaps a timestamp to the start of the frame displayed at that time, so the thumbnail matches the preview. */
export function snapToFrame(time: number, fps: number | null): number {
  if (!fps || fps <= 0) return Math.max(0, time);
  const frame = Math.floor(time * fps + 1e-6);
  return Math.max(0, frame / fps - 0.5 / fps);
}

export function buildThumbnailPlan(job: ThumbnailJob, ctx: PlanContext): FfmpegPlan {
  const video = requireVideo(ctx.probe);
  const max = ctx.probe.durationSec ?? Number.POSITIVE_INFINITY;
  if (!(job.time >= 0 && job.time < max)) throw new MediaError('INVALID_SETTINGS', 'Pick a time within the video.');
  const output = `${ctx.workDir}/thumbnail.png`;
  const seek = snapToFrame(job.time, video.vfr ? null : video.fps);
  return {
    passes: [['-hide_banner', '-nostdin', '-y', '-ss', fmt(seek), '-i', ctx.input, '-map', '0:v:0', '-frames:v', '1', '-update', '1', '-c:v', 'png', output]],
    passWeights: [1],
    output,
    ext: 'png',
    mime: 'image/png',
    progressDuration: null,
    expect: { video: true, audio: false, width: video.width, height: video.height, durationSec: null, durationTolerance: 0, format: 'png' },
    notes: [],
  };
}

export function buildGifPlan(job: GifJob, ctx: PlanContext, maxSeconds: number): FfmpegPlan {
  const video = requireVideo(ctx.probe);
  if (job.duration > maxSeconds) {
    throw new MediaError('TOO_LONG', `GIFs can be at most ${maxSeconds} seconds long on this device.`);
  }
  validateTrim(ctx.probe, { start: job.start, end: job.start + job.duration });
  const fps = int(job.fps, 1, 30);
  const width = int(job.width, 16, 1920);
  const pre: string[] = [];
  let srcW = video.width;
  let srcH = video.height;
  if (job.crop) {
    const c = { x: int(job.crop.x, 0, srcW), y: int(job.crop.y, 0, srcH), w: int(job.crop.width, 1, srcW), h: int(job.crop.height, 1, srcH) };
    pre.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`);
    srcW = c.w;
    srcH = c.h;
  }
  const outW = Math.min(width, srcW);
  const outH = Math.max(1, Math.round((outW * srcH) / srcW));
  const chain = [...pre, `fps=${fps}`, `scale=${outW}:${outH}:flags=lanczos`].join(',');
  const graph = `[0:v]${chain},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
  const output = `${ctx.workDir}/output.gif`;
  return {
    passes: [['-hide_banner', '-nostdin', '-y', '-ss', fmt(job.start), '-t', fmt(job.duration), '-i', ctx.input, '-filter_complex', graph, '-loop', job.loop ? '0' : '-1', output]],
    passWeights: [1],
    output,
    ext: 'gif',
    mime: 'image/gif',
    progressDuration: job.duration,
    expect: { video: true, audio: false, width: outW, height: outH, durationSec: job.duration, durationTolerance: Math.max(0.2, 2 / fps), format: 'gif' },
    notes: ['GIFs are limited to 256 colours per frame and have no sound.'],
  };
}

export function buildPlan(job: VideoJob, ctx: PlanContext, gifMaxSeconds: number): FfmpegPlan {
  switch (job.type) {
    case 'encode':
      return buildEncodePlan(job, ctx);
    case 'remux':
      return buildRemuxPlan(job, ctx);
    case 'extract-audio':
      return buildExtractAudioPlan(job, ctx);
    case 'thumbnail':
      return buildThumbnailPlan(job, ctx);
    case 'gif':
      return buildGifPlan(job, ctx, gifMaxSeconds);
  }
}

/** FFmpeg's preview-proxy encode: small, fast H.264 that any browser can play. */
export function buildPreviewProxyPlan(ctx: PlanContext, maxEdge = 640, maxSeconds?: number): FfmpegPlan {
  const video = requireVideo(ctx.probe);
  const scale = Math.min(1, maxEdge / Math.max(video.width, video.height));
  const w = floorEven(video.width * scale);
  const h = floorEven(video.height * scale);
  const output = `${ctx.workDir}/preview.mp4`;
  const args = ['-hide_banner', '-nostdin', '-y', '-i', ctx.input];
  if (maxSeconds) args.push('-t', fmt(maxSeconds));
  args.push(
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    '-vf', `scale=${w}:${h},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', '-g', '15',
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', output,
  );
  return {
    passes: [args],
    passWeights: [1],
    output,
    ext: 'mp4',
    mime: 'video/mp4',
    progressDuration: maxSeconds ?? ctx.probe.durationSec,
    expect: { video: true, audio: false, width: w, height: h, durationSec: null, durationTolerance: 0, format: 'mp4' },
    notes: [],
  };
}
