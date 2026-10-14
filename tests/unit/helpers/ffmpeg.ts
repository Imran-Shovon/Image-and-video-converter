// Test helpers: generate small media fixtures with the native ffmpeg-static binary.
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';

const run = promisify(execFile);

export const FFMPEG = ffmpegPath as unknown as string;

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'media-toolkit-'));
}

export async function ffmpeg(args: string[]): Promise<{ stderr: string; code: number }> {
  try {
    const { stderr } = await run(FFMPEG, args, { maxBuffer: 64 * 1024 * 1024 });
    return { stderr, code: 0 };
  } catch (error) {
    const e = error as { stderr?: string; code?: number };
    return { stderr: e.stderr ?? '', code: typeof e.code === 'number' ? e.code : 1 };
  }
}

/** Equivalent of the engine's probe: `ffmpeg -i file` banner on stderr. */
export async function banner(path: string): Promise<string> {
  return (await ffmpeg(['-hide_banner', '-i', path])).stderr;
}

export async function makeVideo(
  path: string,
  { width = 320, height = 240, seconds = 2, fps = 25, audio = true, vcodec = 'libx264', acodec = 'aac', extra = [] as string[] } = {},
): Promise<string> {
  const args = ['-hide_banner', '-y', '-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${fps}:duration=${seconds}`];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`);
  args.push('-c:v', vcodec, '-pix_fmt', 'yuv420p', '-g', String(fps));
  if (vcodec === 'libvpx-vp9') args.push('-b:v', '300k', '-deadline', 'realtime', '-cpu-used', '8');
  if (audio) args.push('-c:a', acodec);
  args.push(...extra, '-shortest', path);
  const { code, stderr } = await ffmpeg(args);
  if (code !== 0) throw new Error(`fixture failed: ${stderr.slice(-500)}`);
  return path;
}

export const readBytes = (path: string) => new Uint8Array(readFileSync(path));
