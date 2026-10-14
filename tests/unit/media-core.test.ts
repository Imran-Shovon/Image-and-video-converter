import { describe, expect, it } from 'vitest';
import { ADVERTISED, AUDIO_OUTPUTS, IMAGE_INPUTS, IMAGE_OUTPUTS, OPERATIONS, VIDEO_INPUTS, VIDEO_OUTPUTS } from '@/lib/media/capabilities';
import { ERROR_CODES, ERROR_COPY, MediaError, isMediaError, serializeError, toMediaError } from '@/lib/media/errors';
import type { BrowserFeatures } from '@/lib/media/features';
import { resolveLimits } from '@/lib/media/limits';
import { routeVideoJob } from '@/lib/media/routing';
import { MB } from '@/lib/media/sizes';
import { verifyMediaOutput } from '@/lib/video-processing/verify';
import type { VideoProbe } from '@/lib/video-processing/types';

describe('capability matrix', () => {
  it('has unique ids', () => {
    const unique = <T>(xs: T[]) => new Set(xs).size === xs.length;
    expect(unique(IMAGE_INPUTS.map((c) => c.format))).toBe(true);
    expect(unique(IMAGE_OUTPUTS.map((c) => c.format))).toBe(true);
    expect(unique(VIDEO_INPUTS.map((c) => c.format))).toBe(true);
    expect(unique(VIDEO_OUTPUTS.map((c) => c.id))).toBe(true);
    expect(unique(AUDIO_OUTPUTS.map((c) => c.format))).toBe(true);
    expect(unique(OPERATIONS.map((c) => c.id))).toBe(true);
  });

  it('never advertises something without an engine', () => {
    for (const op of OPERATIONS.filter((o) => ADVERTISED.has(o.status))) expect(op.engines.length, op.id).toBeGreaterThan(0);
    for (const v of VIDEO_OUTPUTS.filter((o) => ADVERTISED.has(o.status))) expect(v.engines.length, v.id).toBeGreaterThan(0);
  });
});

describe('errors', () => {
  it('has copy for every code', () => {
    for (const code of ERROR_CODES) expect(ERROR_COPY[code].title.length).toBeGreaterThan(0);
  });

  it('survives structured-clone style serialisation', () => {
    const plain = structuredClone(serializeError(new MediaError('NO_AUDIO_TRACK')));
    expect(isMediaError(plain)).toBe(true);
    expect(toMediaError(plain).code).toBe('NO_AUDIO_TRACK');
  });

  it('classifies memory failures and aborts', () => {
    expect(toMediaError(new RangeError('Array buffer allocation failed')).code).toBe('OUT_OF_MEMORY');
    expect(toMediaError(new Error('RuntimeError: Aborted(OOM)')).code).toBe('OUT_OF_MEMORY');
    expect(toMediaError(new DOMException('x', 'AbortError')).code).toBe('CANCELLED');
    expect(toMediaError(new Error('boom')).code).toBe('ENCODER_FAILED');
  });
});

describe('limits and routing', () => {
  const features: BrowserFeatures = {
    offscreenCanvas: true,
    webCodecs: true,
    imageDecoder: true,
    crossOriginIsolated: true,
    sharedArrayBuffer: true,
    webAssembly: true,
    workers: true,
    hardwareConcurrency: 8,
    deviceMemoryGb: 8,
  };

  it('uses spec defaults and env overrides', () => {
    expect(resolveLimits('desktop').videoBytes).toBe(500 * MB);
    expect(resolveLimits('mobile').imagePixels).toBe(16_777_216);
    expect(resolveLimits('desktop', { VITE_LIMIT_DESKTOP_VIDEO_MB: '800', VITE_LIMIT_DESKTOP_IMAGE_MEGAPIXELS: '50' })).toMatchObject({
      videoBytes: 800 * MB,
      imagePixels: 50_000_000,
    });
    expect(resolveLimits('desktop', { VITE_LIMIT_DESKTOP_VIDEO_MB: 'nonsense' }).videoBytes).toBe(500 * MB);
  });

  it('routes within limits to the client and rejects beyond them', () => {
    const limits = resolveLimits('desktop');
    expect(routeVideoJob({ sizeBytes: 10 * MB, durationSec: 60, width: 1920, height: 1080 }, limits, features, false).target).toBe('client');
    expect(() => routeVideoJob({ sizeBytes: 10 * MB, durationSec: 3600, width: 1920, height: 1080 }, limits, features, false)).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }),
    );
    expect(() => routeVideoJob({ sizeBytes: 10 * MB, durationSec: 60, width: 7680, height: 4320 }, limits, features, false)).toThrow(
      expect.objectContaining({ code: 'TOO_LARGE' }),
    );
    expect(routeVideoJob({ sizeBytes: 10 * MB, durationSec: 3600, width: 1920, height: 1080 }, limits, features, true).target).toBe('server');
  });
});

describe('verifyMediaOutput', () => {
  const mp4Head = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);
  const probe: VideoProbe = {
    container: 'mp4',
    durationSec: 4.02,
    bitrateKbps: 1000,
    video: { codec: 'h264', width: 640, height: 360, codedWidth: 640, codedHeight: 360, rotation: 0, fps: 30, vfr: false, pixFmt: 'yuv420p', bitrateKbps: 900 },
    audio: { codec: 'aac', channels: 2, sampleRate: 48000, bitrateKbps: 96 },
    videoStreams: 1,
    audioStreams: 1,
    subtitleStreams: 0,
    source: 'ffmpeg',
  };
  const expect4s = { video: true, audio: true, width: 640, height: 360, durationSec: 4, durationTolerance: 0.1, format: 'mp4' as const };

  it('accepts a matching output', () => {
    expect(() => verifyMediaOutput(mp4Head, 1000, probe, expect4s)).not.toThrow();
  });

  it('rejects empty, wrong format, wrong size, missing streams and wrong duration', () => {
    expect(() => verifyMediaOutput(mp4Head, 0, probe, expect4s)).toThrow(/empty/);
    expect(() => verifyMediaOutput(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), 10, probe, expect4s)).toThrow(/MP4/);
    expect(() => verifyMediaOutput(mp4Head, 10, probe, { ...expect4s, width: 642 })).toThrow(/expected/);
    expect(() => verifyMediaOutput(mp4Head, 10, { ...probe, audio: null }, expect4s)).toThrow(/audio/);
    expect(() => verifyMediaOutput(mp4Head, 10, { ...probe, durationSec: 4.5 }, expect4s)).toThrow(/s long/);
    expect(() => verifyMediaOutput(mp4Head, 10, null, expect4s)).toThrow();
  });
});
