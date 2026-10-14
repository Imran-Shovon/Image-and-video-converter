// Generates test media reproducibly with FFmpeg (ffmpeg-static) and Sharp (spec §16).
// Output: tests/fixtures/generated (git-ignored). Run: npm run fixtures
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { createRequire } from 'node:module';
import { crc32 } from 'node:zlib';
import { encodeBmp } from '../src/lib/image-processing/bmp';

// gifenc ships CommonJS without named ESM exports.
const { GIFEncoder } = createRequire(import.meta.url)('gifenc') as typeof import('gifenc');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests', 'fixtures', 'generated');
mkdirSync(out, { recursive: true });
const p = (name: string) => join(out, name);

function ffmpeg(args: string[]) {
  execFileSync(ffmpegPath as unknown as string, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
}

const src = (w: number, h: number, s: number, fps = 25) => ['-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=${fps}:duration=${s}`];
const tone = (s: number, freq = 440) => ['-f', 'lavfi', '-i', `sine=frequency=${freq}:sample_rate=48000:duration=${s}`];

/** PNG signature + IHDR (valid CRC) + an empty IDAT: enough for header parsing, never decodable. */
function pngHeaderOnly(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', Buffer.alloc(0)), chunk('IEND', Buffer.alloc(0))]);
}

async function images() {
  // Photo-like gradient with noise so compression has something to work on.
  const w = 1200;
  const h = 800;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const n = (Math.sin(x * 0.05) + Math.cos(y * 0.07)) * 30 + ((x * 7919 + y * 104729) % 23);
      raw[i] = Math.min(255, Math.max(0, (x / w) * 255 + n));
      raw[i + 1] = Math.min(255, Math.max(0, (y / h) * 255 + n));
      raw[i + 2] = Math.min(255, Math.max(0, 128 + n));
    }
  const photo = sharp(raw, { raw: { width: w, height: h, channels: 3 } });
  await photo.clone().jpeg({ quality: 92 }).toFile(p('photo.jpg'));
  await photo.clone().png().toFile(p('photo.png'));
  await photo.clone().webp({ quality: 90 }).toFile(p('photo.webp'));
  await photo.clone().avif({ quality: 60 }).toFile(p('photo.avif'));

  // Transparent PNG/WebP: opaque red square on a transparent background.
  const transparent = sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: { create: { width: 200, height: 150, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }, left: 100, top: 75 },
  ]);
  await transparent.clone().png().toFile(p('transparent.png'));
  await transparent.clone().webp({ lossless: true }).toFile(p('transparent.webp'));

  // Background removal: a shaded ball (centre 400,330, radius 200) on a soft gradient, with a floor shadow.
  const subject = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe3f5"/><stop offset="1" stop-color="#e9eef2"/></linearGradient>
    <radialGradient id="b" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ff8a65"/><stop offset="1" stop-color="#b71c1c"/></radialGradient></defs>
    <rect width="800" height="600" fill="url(#g)"/><ellipse cx="400" cy="560" rx="170" ry="20" fill="#9aa7b3" opacity=".5"/>
    <circle cx="400" cy="330" r="200" fill="url(#b)"/></svg>`;
  await sharp(Buffer.from(subject)).jpeg({ quality: 90 }).toFile(p('subject.jpg'));

  // EXIF orientation 6 (rotate 90° CW): stored 300×200, displayed 200×300. Left half red, right half blue.
  const oriented = sharp({ create: { width: 300, height: 200, channels: 3, background: '#0000ff' } }).composite([
    { input: { create: { width: 150, height: 200, channels: 3, background: '#ff0000' } }, left: 0, top: 0 },
  ]);
  await sharp(await oriented.jpeg().toBuffer()).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toFile(p('exif-rotated.jpg'));

  await sharp({ create: { width: 1, height: 1, channels: 3, background: '#00ff00' } }).png().toFile(p('tiny-1x1.png'));
  await sharp({ create: { width: 301, height: 201, channels: 3, background: '#336699' } }).png().toFile(p('odd-301x201.png'));
  await photo.clone().resize(400, 300).toColourspace('cmyk').jpeg().toFile(p('cmyk.jpg'));
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).resize(300, 200).withIccProfile('p3').jpeg().toFile(p('display-p3.jpg'));
  const small = await photo.clone().resize(320, 240).ensureAlpha().raw().toBuffer();
  writeFileSync(p('photo.bmp'), encodeBmp(small, 320, 240));

  // Animated GIF (3 frames).
  const enc = GIFEncoder();
  const palette = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
  ];
  for (let f = 0; f < 3; f++) enc.writeFrame(new Uint8Array(64 * 48).fill(f), 64, 48, { palette, delay: 200 });
  enc.finish();
  writeFileSync(p('animated.gif'), enc.bytes());
  await sharp(p('animated.gif'), { animated: true }).webp().toFile(p('animated.webp'));

  // Broken and hostile inputs.
  const jpg = readFileSync(p('photo.jpg'));
  writeFileSync(p('truncated.jpg'), jpg.subarray(0, 600));
  writeFileSync(p('empty.png'), Buffer.alloc(0));
  writeFileSync(p('png-named.jpg'), readFileSync(p('transparent.png')));
  writeFileSync(p('script.svg'), '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  writeFileSync(p('playlist.m3u8'), '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10,\nfile:///etc/passwd\n');
  writeFileSync(p('concat.txt'), 'ffconcat version 1.0\nfile /etc/passwd\n');
  writeFileSync(p('random.bin'), Buffer.from('this is not a media file at all, just text bytes'));
  // Decompression bomb: a tiny file whose PNG header claims 20000×20000 (400 MP). Must be rejected before decoding.
  writeFileSync(p('bomb-20000x20000.png'), pngHeaderOnly(20000, 20000));
}

function videos() {
  ffmpeg([...src(640, 360, 3), ...tone(3), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '25', '-c:a', 'aac', '-shortest', p('h264-aac.mp4')]);
  ffmpeg([...src(640, 360, 3), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', p('no-audio.mp4')]);
  ffmpeg([...src(320, 240, 2), ...tone(2), '-c:v', 'libvpx-vp9', '-b:v', '300k', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', '-shortest', p('vp9-opus.webm')]);
  ffmpeg([...src(320, 240, 2), ...tone(2), '-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-c:a', 'aac', '-shortest', p('hevc.mp4')]);
  ffmpeg([...src(320, 240, 2), ...tone(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('h264.mkv')]);
  ffmpeg([...src(320, 240, 2), ...tone(2), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-f', 'mov', p('h264.mov')]);
  ffmpeg(['-i', p('h264.mov'), '-c', 'copy', '-brand', 'M4V ', '-f', 'mp4', p('clip.m4v')]);
  // Phone-style rotation metadata: stored 640×360, displayed portrait.
  ffmpeg(['-display_rotation', '-90', '-i', p('h264-aac.mp4'), '-c', 'copy', p('rotated.mp4')]);
  // Variable frame rate: 1.2 s at 25 fps, then 30 fps (timestamps not on a single lattice).
  ffmpeg([...src(320, 240, 3, 30), '-vf', "setpts='if(lt(N,30),N/25,1.2+(N-30)/30)/TB'", '-fps_mode', 'vfr', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', p('vfr.mp4')]);
  // Two audio tracks.
  ffmpeg([...src(320, 240, 2), ...tone(2, 440), ...tone(2, 880), '-map', '0:v', '-map', '1:a', '-map', '2:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('multi-audio.mkv')]);
  // Longer 720p clip for cancellation tests.
  ffmpeg([...src(1280, 720, 20), ...tone(20), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', p('long-720p.mp4')]);
  // Odd dimensions.
  ffmpeg([...src(321, 241, 1), '-c:v', 'libx264', '-pix_fmt', 'yuv444p', p('odd-dims.mp4')]);
  const mp4 = readFileSync(p('h264-aac.mp4'));
  writeFileSync(p('truncated.mp4'), mp4.subarray(0, 2000));
  writeFileSync(p('mp4-named.webm'), mp4);
}

await images();
videos();
console.log(`Fixtures written to ${out}`);
if (!existsSync(p('h264-aac.mp4'))) process.exit(1);
