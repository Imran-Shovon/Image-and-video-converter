import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildEncodePlan,
  buildExtractAudioPlan,
  buildGeometry,
  buildGifPlan,
  buildRemuxPlan,
  buildThumbnailPlan,
  canRemux,
  snapCrop,
  snapToFrame,
  type FfmpegPlan,
} from '@/lib/video-processing/args';
import { planTargetBitrate } from '@/lib/video-processing/bitrate';
import { parseFfmpegProbe } from '@/lib/video-processing/probe-parse';
import type { VideoProbe } from '@/lib/video-processing/types';
import { verifyMediaOutput } from '@/lib/video-processing/verify';
import { banner, ffmpeg, makeVideo, readBytes, tempDir } from './helpers/ffmpeg';

const probe = (over: Partial<VideoProbe> = {}): VideoProbe => ({
  container: 'mov,mp4',
  durationSec: 10,
  bitrateKbps: 2000,
  video: { codec: 'h264', width: 1920, height: 1080, codedWidth: 1920, codedHeight: 1080, rotation: 0, fps: 30, vfr: false, pixFmt: 'yuv420p', bitrateKbps: 1800 },
  audio: { codec: 'aac', channels: 2, sampleRate: 48000, bitrateKbps: 128 },
  videoStreams: 1,
  audioStreams: 1,
  subtitleStreams: 0,
  source: 'ffmpeg',
  ...over,
});
const ctx = (p = probe()) => ({ input: '/input/input.mp4', workDir: '/work', probe: p });

describe('geometry and snapping', () => {
  it('snaps crops to even values inside the frame', () => {
    expect(snapCrop({ x: 11, y: 7, width: 641, height: 359 }, 1920, 1080)).toEqual({ x: 12, y: 8, width: 640, height: 358 });
    expect(snapCrop({ x: 1915, y: 0, width: 101, height: 101 }, 1919, 1079)).toMatchObject({ width: 100, height: 100 });
  });

  it('builds crop → rotate → flip → scale filters with even output', () => {
    const g = buildGeometry(probe(), { crop: { x: 100, y: 50, width: 801, height: 601 }, rotate: 90, flipH: true, scale: { width: 301 } }, true);
    expect(g.filters).toEqual(['crop=800:600:100:50', 'transpose=1', 'hflip', 'scale=300:400:flags=lanczos']);
    expect(g).toMatchObject({ width: 300, height: 400 });
    expect(g.notes.length).toBeGreaterThan(0);
  });
});

describe('encode plans', () => {
  it('builds an MP4 H.264 CRF encode with faststart and stream policy', () => {
    const plan = buildEncodePlan(
      { type: 'encode', output: 'mp4-h264', transform: {}, rate: { mode: 'crf', crf: 23 }, speed: 'veryfast', audio: { mode: 'encode', bitrateKbps: 128 } },
      ctx(),
    );
    const args = plan.passes[0]!;
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast', '-c:a', 'aac', '-movflags', '+faststart']));
    expect(args.join(' ')).toContain('-map 0:v:0 -map 0:a:0 -sn -dn -map_metadata -1 -map_chapters -1');
    expect(args.join(' ')).toContain('format=yuv420p');
    expect(args.at(-1)).toBe('/work/output.mp4');
    expect(plan.expect).toMatchObject({ width: 1920, height: 1080, audio: true, durationSec: 10 });
  });

  it('builds two-pass bitrate encodes', () => {
    const plan = buildEncodePlan(
      { type: 'encode', output: 'webm-vp9', transform: { trim: { start: 2, end: 5 } }, rate: { mode: 'bitrate', videoKbps: 500, twoPass: true }, speed: 'faster', audio: { mode: 'remove' } },
      ctx(),
    );
    expect(plan.passes).toHaveLength(2);
    expect(plan.passes[0]!.join(' ')).toContain('-pass 1');
    expect(plan.passes[0]!.slice(-3)).toEqual(['-f', 'null', '/dev/null']);
    expect(plan.passes[1]!.join(' ')).toContain('-pass 2');
    expect(plan.passes[1]!.join(' ')).toContain('-ss 2 -i /input/input.mp4 -t 3');
    expect(plan.passes[1]).toContain('-an');
    expect(plan.expect).toMatchObject({ durationSec: 3, audio: false });
  });

  it('rejects invalid trims and clamps CRF', () => {
    expect(() =>
      buildEncodePlan(
        { type: 'encode', output: 'mp4-h264', transform: { trim: { start: 5, end: 2 } }, rate: { mode: 'crf', crf: 23 }, speed: 'veryfast', audio: { mode: 'remove' } },
        ctx(),
      ),
    ).toThrow();
    const plan = buildEncodePlan(
      { type: 'encode', output: 'mp4-h264', transform: {}, rate: { mode: 'crf', crf: 999 }, speed: 'veryfast', audio: { mode: 'remove' } },
      ctx(),
    );
    expect(plan.passes[0]).toEqual(expect.arrayContaining(['-crf', '51']));
  });
});

describe('remux, audio, thumbnail, gif plans', () => {
  it('only remuxes compatible streams', () => {
    expect(canRemux(probe(), 'mp4')).toBe(true);
    expect(canRemux(probe(), 'webm')).toBe(false);
    expect(canRemux(probe({ audio: { codec: 'pcm_s16le', channels: 2, sampleRate: 48000, bitrateKbps: null } }), 'mp4')).toBe(false);
    expect(canRemux(probe({ audio: { codec: 'pcm_s16le', channels: 2, sampleRate: 48000, bitrateKbps: null } }), 'mp4', true)).toBe(true);
    expect(() => buildRemuxPlan({ type: 'remux', container: 'webm' }, ctx())).toThrow();
  });

  it('extract audio copies when possible and errors without audio', () => {
    expect(buildExtractAudioPlan({ type: 'extract-audio', format: 'm4a', bitrateKbps: 192, allowCopy: true }, ctx()).passes[0]).toEqual(
      expect.arrayContaining(['-c:a', 'copy']),
    );
    expect(buildExtractAudioPlan({ type: 'extract-audio', format: 'mp3', bitrateKbps: 192, allowCopy: true }, ctx()).passes[0]).toEqual(
      expect.arrayContaining(['-c:a', 'libmp3lame', '-b:a', '192k']),
    );
    expect(() => buildExtractAudioPlan({ type: 'extract-audio', format: 'mp3', bitrateKbps: 192, allowCopy: true }, ctx(probe({ audio: null })))).toThrow(
      /audio/i,
    );
  });

  it('snaps thumbnail times to the displayed frame', () => {
    // At 25 fps, t=1.03 shows frame 25 (pts 1.00). Seek to just before it so FFmpeg returns that frame.
    expect(snapToFrame(1.03, 25)).toBeCloseTo(0.98);
    expect(snapToFrame(1.0, 25)).toBeCloseTo(0.98);
    expect(buildThumbnailPlan({ type: 'thumbnail', time: 3 }, ctx()).expect).toMatchObject({ width: 1920, height: 1080, format: 'png' });
  });

  it('enforces GIF duration limits and uses palettegen/paletteuse', () => {
    expect(() => buildGifPlan({ type: 'gif', start: 0, duration: 31, fps: 10, width: 480, loop: true }, ctx(probe({ durationSec: 60 })), 30)).toThrow();
    const plan = buildGifPlan({ type: 'gif', start: 1, duration: 3, fps: 12, width: 480, loop: true }, ctx(), 30);
    expect(plan.passes[0]!.join(' ')).toMatch(/palettegen.*paletteuse/);
    expect(plan.expect).toMatchObject({ width: 480, height: 270 });
  });
});

describe('target bitrate maths', () => {
  it('subtracts audio and overhead', () => {
    const plan = planTargetBitrate(10_000_000, 60, 128, 1280, 720);
    // 10 MB × 8 × 0.96 / 60 s = 1280 kbps total, minus 128 kbps audio.
    expect(plan.videoKbps).toBe(1152);
    expect(plan.tooLow).toBe(false);
  });

  it('warns and suggests a lower resolution when the bitrate is unrealistic', () => {
    // 20 MB over 2 minutes leaves ~1.2 Mbps for video: too little for 4K or 1080p, fine for 720p.
    const plan = planTargetBitrate(20_000_000, 120, 64, 3840, 2160);
    expect(plan.tooLow).toBe(true);
    expect(plan.suggestedMaxEdge).toBe(1280);
    expect(planTargetBitrate(100_000, 120, 64, 1920, 1080).suggestedMaxEdge).toBeNull();
  });
});

// Runs the generated argument arrays through native FFmpeg and validates the outputs with the app's verifier.
describe('plans execute correctly with real FFmpeg', () => {
  let dir: string;
  let source: string;
  let sourceProbe: VideoProbe;

  beforeAll(async () => {
    dir = tempDir();
    source = await makeVideo(join(dir, 'src.mp4'), { width: 320, height: 240, seconds: 3, fps: 25 });
    sourceProbe = parseFfmpegProbe(await banner(source))!;
  }, 60_000);

  async function execute(plan: FfmpegPlan) {
    const swap = (a: string) => {
      if (a === '/input/input.mp4') return source;
      if (a === '/dev/null') return process.platform === 'win32' ? 'NUL' : a;
      return a.startsWith('/work/') ? join(dir, a.slice(6)) : a;
    };
    for (const pass of plan.passes) {
      const { code, stderr } = await ffmpeg(pass.map(swap));
      expect(code, stderr.slice(-800)).toBe(0);
    }
    const out = swap(plan.output);
    const outProbe = parseFfmpegProbe(await banner(out));
    const bytes = readBytes(out);
    verifyMediaOutput(bytes.subarray(0, 4100), bytes.byteLength, outProbe, plan.expect);
    return outProbe!;
  }

  const c = () => ({ input: '/input/input.mp4', workDir: '/work', probe: sourceProbe });

  it('crop + rotate + scale + trim encode (single pass)', async () => {
    const p = await execute(
      buildEncodePlan(
        {
          type: 'encode',
          output: 'mp4-h264',
          transform: { trim: { start: 0.5, end: 2.5 }, crop: { x: 11, y: 9, width: 201, height: 151 }, rotate: 90, scale: { height: 200 } },
          rate: { mode: 'crf', crf: 28 },
          speed: 'ultrafast',
          audio: { mode: 'encode', bitrateKbps: 96 },
        },
        c(),
      ),
    );
    expect(p.video).toMatchObject({ width: 150, height: 200 });
    expect(p.durationSec!).toBeCloseTo(2, 1);
  }, 60_000);

  it('two-pass bitrate WebM VP9 with audio removed', async () => {
    const p = await execute(
      buildEncodePlan(
        { type: 'encode', output: 'webm-vp9', transform: {}, rate: { mode: 'bitrate', videoKbps: 200, twoPass: true }, speed: 'ultrafast', audio: { mode: 'remove' } },
        c(),
      ),
    );
    expect(p.audio).toBeNull();
    expect(p.video!.codec).toBe('vp9');
  }, 60_000);

  it('VP8 + Vorbis and MOV outputs', async () => {
    const vp8 = await execute(
      buildEncodePlan({ type: 'encode', output: 'webm-vp8', transform: {}, rate: { mode: 'crf', crf: 20 }, speed: 'ultrafast', audio: { mode: 'encode', bitrateKbps: 96 } }, c()),
    );
    expect(vp8.audio!.codec).toBe('vorbis');
    const mov = await execute(
      buildEncodePlan({ type: 'encode', output: 'mov-h264', transform: { flipV: true }, rate: { mode: 'crf', crf: 26 }, speed: 'ultrafast', audio: { mode: 'encode', bitrateKbps: 96 } }, c()),
    );
    expect(mov.container).toContain('mov');
  }, 60_000);

  it('remux, fast trim and remove audio', async () => {
    const mov = await execute(buildRemuxPlan({ type: 'remux', container: 'mov' }, c()));
    expect(mov.video!.codec).toBe('h264');
    const trimmed = await execute(buildRemuxPlan({ type: 'remux', container: 'mp4', trim: { start: 1, end: 2 } }, c()));
    expect(trimmed.durationSec!).toBeLessThanOrEqual(3);
    const silent = await execute(buildRemuxPlan({ type: 'remux', container: 'mp4', removeAudio: true }, c()));
    expect(silent.audio).toBeNull();
  }, 60_000);

  it('extracts audio to every format', async () => {
    for (const format of ['mp3', 'm4a', 'wav', 'opus'] as const) {
      const p = await execute(buildExtractAudioPlan({ type: 'extract-audio', format, bitrateKbps: 128, allowCopy: true }, c()));
      expect(p.audio).not.toBeNull();
      expect(p.video).toBeNull();
    }
  }, 60_000);

  it('makes a thumbnail and a GIF', async () => {
    const thumb = await execute(buildThumbnailPlan({ type: 'thumbnail', time: 1.5 }, c()));
    expect(thumb.video).toMatchObject({ width: 320, height: 240 });
    const gif = await execute(buildGifPlan({ type: 'gif', start: 0.5, duration: 1.5, fps: 10, width: 160, loop: true }, c(), 30));
    expect(gif.video).toMatchObject({ codec: 'gif', width: 160, height: 120 });
  }, 60_000);
});
