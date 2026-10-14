// WebCodecs fast path via Mediabunny (spec §5): hardware-accelerated where the browser supports it.
// Used for re-encode jobs only; everything else (and any unsupported config) falls back to ffmpeg.wasm.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
  type AudioCodec,
  type VideoCodec,
} from 'mediabunny';
import { videoOutputCapability } from '@/lib/media/capabilities';
import { MediaError, toMediaError } from '@/lib/media/errors';
import { detectFeatures } from '@/lib/media/features';
import { buildGeometry, trimDuration, type OutputExpectation } from './args';
import { codecForOutput } from './presets';
import { toMediabunnyGeometry } from './transform-map';
import type { EncodeJob, VideoProbe, VideoProgress } from './types';

const MB_VIDEO_CODEC: Record<string, VideoCodec> = { h264: 'avc', vp9: 'vp9', vp8: 'vp8' };
const CODEC_NAMES: Record<string, string> = { avc: 'h264', hevc: 'hevc', vp9: 'vp9', vp8: 'vp8', av1: 'av1', prores: 'prores' };

/** Reads stream information without loading ffmpeg.wasm. Returns null when Mediabunny can't parse the file. */
export async function probeWithMediabunny(file: Blob): Promise<VideoProbe | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!(await input.canRead())) return null;
    const format = await input.getFormat();
    const [videoTracks, audioTracks] = await Promise.all([input.getVideoTracks(), input.getAudioTracks()]);
    const vt = await input.getPrimaryVideoTrack();
    const at = await input.getPrimaryAudioTrack();
    const duration = await input.computeDuration();

    let video: VideoProbe['video'] = null;
    if (vt) {
      const stats = await vt.computePacketStats(120);
      // Uneven frame spacing means variable frame rate (typical for phone recordings).
      const rate = await vt.computeFrameRateMetrics({ targetPacketCount: 300 }).catch(() => null);
      const rotation = await vt.getRotation();
      video = {
        codec: CODEC_NAMES[(await vt.getCodec()) ?? ''] ?? 'unknown',
        width: await vt.getDisplayWidth(),
        height: await vt.getDisplayHeight(),
        codedWidth: await vt.getCodedWidth(),
        codedHeight: await vt.getCodedHeight(),
        rotation,
        fps: rate ? Math.round(rate.bestGuessFrameRate * 1000) / 1000 : stats.averagePacketRate > 0 ? Math.round(stats.averagePacketRate * 1000) / 1000 : null,
        vfr: rate ? !rate.frameRateIsConstant : false,
        pixFmt: null,
        bitrateKbps: stats.averageBitrate > 0 ? Math.round(stats.averageBitrate / 1000) : null,
      };
    }
    let audio: VideoProbe['audio'] = null;
    if (at) {
      const codec = (await at.getCodec()) ?? 'unknown';
      audio = {
        codec: codec === 'pcm-s16' ? 'pcm_s16le' : codec,
        channels: await at.getNumberOfChannels(),
        sampleRate: await at.getSampleRate(),
        bitrateKbps: null,
      };
    }
    return {
      container: format.name,
      durationSec: Number.isFinite(duration) && duration > 0 ? duration : null,
      bitrateKbps: duration > 0 ? Math.round((file.size * 8) / duration / 1000) : null,
      video,
      audio,
      videoStreams: videoTracks.length,
      audioStreams: audioTracks.length,
      subtitleStreams: 0,
      source: 'mediabunny',
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

export interface WebCodecsPlan {
  expect: OutputExpectation;
  notes: string[];
  ext: string;
  mime: string;
}

/** Returns a plan when this job can run on WebCodecs in this browser, otherwise null. */
export async function planWebCodecs(job: EncodeJob, probe: VideoProbe, file: Blob): Promise<WebCodecsPlan | null> {
  if (!detectFeatures().webCodecs) return null;
  if (job.output !== 'mp4-h264' && job.output !== 'webm-vp9') return null;
  // Two-pass needs ffmpeg.wasm, except for VP9 where WebCodecs (single pass) is the only encoder.
  if (job.rate.mode === 'bitrate' && job.rate.twoPass && job.output !== 'webm-vp9') return null;
  if (!probe.video || probe.source !== 'mediabunny') return null;

  const geometry = buildGeometry(probe, job.transform, true);
  const codec = MB_VIDEO_CODEC[codecForOutput(job.output)]!;
  const quality = new Quality({ bitrate: 2_000_000 });
  if (!(await canEncodeVideo(codec, { width: geometry.width, height: geometry.height, quality }).catch(() => false))) return null;
  const cap = videoOutputCapability(job.output);
  const audioCodec: AudioCodec = cap.audioCodec === 'opus' ? 'opus' : 'aac';
  const keepAudio = job.audio.mode === 'encode' && probe.audio !== null;
  if (keepAudio && !(await canEncodeAudio(audioCodec).catch(() => false))) return null;

  // Confirm the browser can decode the source track.
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const vt = await input.getPrimaryVideoTrack();
    if (!vt || !(await vt.canDecode())) return null;
    if (keepAudio) {
      const at = await input.getPrimaryAudioTrack();
      if (!at || !(await at.canDecode())) return null;
    }
  } catch {
    return null;
  } finally {
    input.dispose();
  }

  const duration = trimDuration(probe, job.transform.trim);
  return {
    expect: {
      video: true,
      audio: keepAudio,
      width: geometry.width,
      height: geometry.height,
      durationSec: duration,
      durationTolerance: 0.15,
      format: cap.container === 'webm' ? 'webm' : 'mp4',
    },
    notes: [...geometry.notes, 'Encoded with your browser’s built-in (hardware-accelerated) encoder.'],
    ext: cap.container,
    mime: cap.container === 'webm' ? 'video/webm' : 'video/mp4',
  };
}

/** Approximate bitrate for a quantizer-based encode; used as the fallback when the browser lacks quantizer mode. */
function fallbackBitrate(width: number, height: number, fps: number, crf: number, codec: string): number {
  const base = width * height * fps * 0.1;
  const neutral = codec === 'vp9' ? 33 : 23;
  return Math.max(150_000, Math.round(base * Math.pow(2, (neutral - crf) / 6)));
}

export async function runWebCodecs(
  job: EncodeJob,
  probe: VideoProbe,
  file: Blob,
  { signal, onProgress }: { signal?: AbortSignal; onProgress?: (p: VideoProgress) => void },
): Promise<Uint8Array> {
  const video = probe.video!;
  const codecKey = codecForOutput(job.output);
  const codec = MB_VIDEO_CODEC[codecKey]!;
  const cap = videoOutputCapability(job.output);
  const geometry = buildGeometry(probe, job.transform, true);
  const mapped = toMediabunnyGeometry(video.width, video.height, job.transform);

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({
    format: cap.container === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  const fps = job.transform.fps ?? video.fps ?? 30;
  const videoQuality =
    job.rate.mode === 'crf'
      ? new Quality({ quantizer: job.rate.crf, bitrate: fallbackBitrate(geometry.width, geometry.height, fps, job.rate.crf, codecKey) })
      : new Quality({ bitrate: job.rate.videoKbps * 1000 });

  let conversion: Conversion | null = null;
  const onAbort = () => void conversion?.cancel();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      tags: {},
      showWarnings: false,
      trim: job.transform.trim ? { start: job.transform.trim.start, end: job.transform.trim.end } : undefined,
      video: {
        codec,
        rotate: mapped.rotate,
        flip: mapped.flip,
        crop: mapped.crop,
        width: geometry.width,
        height: geometry.height,
        fit: 'fill',
        frameRate: job.transform.fps,
        quality: videoQuality,
        allowTransformationMetadata: false,
        forceTranscode: true,
      },
      audio:
        job.audio.mode === 'remove' || !probe.audio
          ? { discard: true }
          : { codec: cap.audioCodec === 'opus' ? 'opus' : 'aac', quality: new Quality({ bitrate: job.audio.bitrateKbps * 1000 }) },
    });
    if (!conversion.isValid) throw new MediaError('CODEC_UNAVAILABLE');
    if (signal?.aborted) throw new MediaError('CANCELLED');
    conversion.onProgress = (fraction) => onProgress?.({ stage: 'processing', fraction: Math.min(0.999, fraction), message: 'Encoding (hardware accelerated)' });
    onProgress?.({ stage: 'processing', fraction: 0, message: 'Encoding (hardware accelerated)' });
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer) throw new MediaError('ENCODER_FAILED');
    return new Uint8Array(buffer);
  } catch (error) {
    if (error instanceof ConversionCanceledError || signal?.aborted) throw new MediaError('CANCELLED');
    throw toMediaError(error);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    input.dispose();
  }
}
