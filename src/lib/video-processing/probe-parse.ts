// Parses FFmpeg's input banner (`ffmpeg -i file`) into a VideoProbe, and progress lines into seconds.
// Pure functions so they can be unit-tested against captured output.
import type { AudioStreamInfo, VideoProbe, VideoStreamInfo } from './types';

export function parseTimestamp(text: string): number | null {
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Extracts processed time from an FFmpeg progress line such as `frame= 12 … time=00:00:04.00 bitrate=…`. */
export function parseProgressTime(line: string): number | null {
  const m = /time=\s*(-?\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(line);
  if (!m || m[1]!.startsWith('-')) return null;
  return parseTimestamp(m[1]!);
}

/** Splits on commas that are not inside parentheses or brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function rate(text: string, unit: string): number | null {
  const m = new RegExp(`([\\d.]+)(k)? ${unit}\\b`).exec(text);
  if (!m) return null;
  return Number(m[1]) * (m[2] ? 1000 : 1);
}

function channelCount(text: string): number | null {
  if (/\bmono\b/.test(text)) return 1;
  if (/\bstereo\b/.test(text)) return 2;
  const layout = /\b(\d)\.(\d)(?:\([a-z]+\))?/.exec(text);
  if (layout) return Number(layout[1]) + Number(layout[2]);
  const n = /(\d+) channels/.exec(text);
  return n ? Number(n[1]) : null;
}

interface StreamBlock {
  type: string;
  desc: string;
  extra: string[];
}

export function parseFfmpegProbe(log: string): VideoProbe | null {
  const lines = log.split(/\r?\n/);
  const inputLine = lines.find((l) => /^Input #0, /.test(l.trim()));
  if (!inputLine) return null;
  const container = /^Input #0, (.+?), from /.exec(inputLine.trim())?.[1] ?? 'unknown';

  let durationSec: number | null = null;
  let bitrateKbps: number | null = null;
  const streams: StreamBlock[] = [];
  let currentStream: StreamBlock | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('Input #1') || line.startsWith('Output #') || line.startsWith('Stream mapping')) break;
    const dur = /^Duration: ([^,]+), (?:start: [^,]+, )?bitrate: (N\/A|\d+) kb\/s/.exec(line);
    if (dur) {
      durationSec = dur[1] === 'N/A' ? null : parseTimestamp(dur[1]!);
      bitrateKbps = dur[2] === 'N/A' ? null : Number(dur[2]);
      continue;
    }
    const stream = /^Stream #0:\d+(?:\[0x[0-9a-f]+\])?(?:\([^)]*\))?: (Video|Audio|Subtitle|Data|Attachment): (.*)$/.exec(line);
    if (stream) {
      currentStream = { type: stream[1]!, desc: stream[2]!, extra: [] };
      streams.push(currentStream);
      continue;
    }
    if (currentStream) currentStream.extra.push(line);
  }

  const videoBlocks = streams.filter((s) => s.type === 'Video' && !/\(attached pic\)/.test(s.desc));
  const audioBlocks = streams.filter((s) => s.type === 'Audio');

  let video: VideoStreamInfo | null = null;
  const vb = videoBlocks[0];
  if (vb) {
    const parts = splitTopLevel(vb.desc);
    const codec = parts[0]?.split(/\s+/)[0] ?? 'unknown';
    const pixFmt = parts[1] && /^[a-z0-9_]+(\(|$)/.test(parts[1]) ? parts[1].split('(')[0]! : null;
    const dims = /\b(\d{1,5})x(\d{1,5})\b/.exec(vb.desc);
    const codedWidth = dims ? Number(dims[1]) : 0;
    const codedHeight = dims ? Number(dims[2]) : 0;
    let rotation = 0;
    for (const extra of vb.extra) {
      const dm = /displaymatrix: rotation of (-?[\d.]+) degrees/.exec(extra);
      if (dm) rotation = -Number(dm[1]);
      const tag = /^rotate\s*:\s*(-?\d+)/.exec(extra);
      if (tag) rotation = Number(tag[1]);
    }
    rotation = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
    const swap = rotation === 90 || rotation === 270;
    const fps = rate(vb.desc, 'fps');
    const tbr = rate(vb.desc, 'tbr');
    video = {
      codec,
      codedWidth,
      codedHeight,
      width: swap ? codedHeight : codedWidth,
      height: swap ? codedWidth : codedHeight,
      rotation,
      fps,
      // FFmpeg prints the average rate as "fps" and the base rate as "tbr"; they differ for VFR phone footage
      // (e.g. "29.98 fps, 30 tbr") but match for constant-rate video, including NTSC 29.97.
      vfr: fps !== null && tbr !== null && Math.abs(fps - tbr) >= 0.01,
      pixFmt,
      bitrateKbps: rate(vb.desc, 'kb/s'),
    };
  }

  let audio: AudioStreamInfo | null = null;
  const ab = audioBlocks[0];
  if (ab) {
    audio = {
      codec: splitTopLevel(ab.desc)[0]?.split(/\s+/)[0] ?? 'unknown',
      sampleRate: rate(ab.desc, 'Hz'),
      channels: channelCount(ab.desc),
      bitrateKbps: rate(ab.desc, 'kb/s'),
    };
  }

  return {
    container,
    durationSec,
    bitrateKbps,
    video,
    audio,
    videoStreams: videoBlocks.length,
    audioStreams: audioBlocks.length,
    subtitleStreams: streams.filter((s) => s.type === 'Subtitle').length,
    source: 'ffmpeg',
  };
}
