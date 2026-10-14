import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseFfmpegProbe, parseProgressTime, parseTimestamp } from '@/lib/video-processing/probe-parse';
import { banner, ffmpeg, makeVideo, tempDir } from './helpers/ffmpeg';

// Captured from ffmpeg.wasm (FFmpeg 5.1) for a portrait phone video.
const PHONE_51 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/input/input.mov':
  Metadata:
    major_brand     : qt
    creation_time   : 2024-05-01T10:00:00.000000Z
  Duration: 00:00:12.48, start: 0.000000, bitrate: 16815 kb/s
  Stream #0:0[0x1](und): Video: hevc (Main) (hvc1 / 0x31637668), yuv420p(tv, bt709), 1920x1080, 16626 kb/s, 29.98 fps, 30 tbr, 600 tbn (default)
    Metadata:
      handler_name    : Core Media Video
    Side data:
      displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 174 kb/s (default)
  Stream #0:2[0x3](und): Data: none (mebx / 0x7862656D), 0 kb/s (default)
At least one output file must be specified`;

describe('parseFfmpegProbe', () => {
  it('parses an FFmpeg 5.1 banner with display-matrix rotation', () => {
    const p = parseFfmpegProbe(PHONE_51)!;
    expect(p.container).toBe('mov,mp4,m4a,3gp,3g2,mj2');
    expect(p.durationSec).toBeCloseTo(12.48);
    expect(p.video).toMatchObject({ codec: 'hevc', codedWidth: 1920, codedHeight: 1080, width: 1080, height: 1920, rotation: 90, pixFmt: 'yuv420p', fps: 29.98 });
    expect(p.video!.vfr).toBe(true);
    expect(p.audio).toMatchObject({ codec: 'aac', sampleRate: 44100, channels: 2, bitrateKbps: 174 });
    expect(p.videoStreams).toBe(1);
    expect(p.audioStreams).toBe(1);
  });

  it('returns null when there is no input banner', () => {
    expect(parseFfmpegProbe('/input/x.mp4: Invalid data found when processing input')).toBeNull();
  });

  describe('against real FFmpeg output', () => {
    let dir: string;
    beforeAll(async () => {
      dir = tempDir();
      await makeVideo(join(dir, 'a.mp4'), { width: 320, height: 240, seconds: 2, fps: 25 });
      await makeVideo(join(dir, 'b.webm'), { width: 160, height: 90, seconds: 1, audio: false, vcodec: 'libvpx-vp9' });
      await ffmpeg(['-y', '-display_rotation', '90', '-i', join(dir, 'a.mp4'), '-c', 'copy', join(dir, 'rot.mp4')]);
    }, 60_000);

    it('reads H.264/AAC MP4', async () => {
      const p = parseFfmpegProbe(await banner(join(dir, 'a.mp4')))!;
      expect(p.durationSec).toBeCloseTo(2, 1);
      expect(p.video).toMatchObject({ codec: 'h264', width: 320, height: 240, fps: 25, rotation: 0, vfr: false });
      expect(p.audio).toMatchObject({ codec: 'aac', sampleRate: 48000, channels: 1 });
    });

    it('reads VP9 WebM without audio', async () => {
      const p = parseFfmpegProbe(await banner(join(dir, 'b.webm')))!;
      expect(p.video).toMatchObject({ codec: 'vp9', width: 160, height: 90 });
      expect(p.audio).toBeNull();
      expect(p.audioStreams).toBe(0);
    });

    it('applies rotation metadata to display dimensions', async () => {
      const p = parseFfmpegProbe(await banner(join(dir, 'rot.mp4')))!;
      expect([90, 270]).toContain(p.video!.rotation);
      expect(p.video).toMatchObject({ width: 240, height: 320, codedWidth: 320, codedHeight: 240 });
    });
  });
});

describe('progress parsing', () => {
  it('reads time= from progress lines', () => {
    expect(parseProgressTime('frame=  120 fps= 30 q=28.0 size=     512kB time=00:00:04.00 bitrate=1048.6kbits/s speed=1.0x')).toBe(4);
    expect(parseProgressTime('size=       1kB time=00:01:02.50 bitrate=   0.1kbits/s')).toBe(62.5);
    expect(parseProgressTime('time=N/A bitrate=N/A')).toBeNull();
    expect(parseProgressTime('time=-00:00:00.02')).toBeNull();
    expect(parseTimestamp('01:00:00.00')).toBe(3600);
  });
});
