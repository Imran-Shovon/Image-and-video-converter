import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { sniff } from '@/lib/media/detect';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

function ftyp(major: string, compat: string[] = []) {
  const size = 16 + compat.length * 4;
  return bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compat);
}

describe('sniff', () => {
  it('detects real images produced by an encoder', async () => {
    const base = sharp({ create: { width: 4, height: 3, channels: 4, background: '#ff000080' } });
    expect(sniff(new Uint8Array(await base.clone().png().toBuffer()))).toEqual({ kind: 'known', format: 'png' });
    expect(sniff(new Uint8Array(await base.clone().jpeg().toBuffer()))).toEqual({ kind: 'known', format: 'jpeg' });
    expect(sniff(new Uint8Array(await base.clone().webp().toBuffer()))).toEqual({ kind: 'known', format: 'webp' });
    expect(sniff(new Uint8Array(await base.clone().avif().toBuffer()))).toEqual({ kind: 'known', format: 'avif' });
    expect(sniff(new Uint8Array(await base.clone().gif().toBuffer()))).toEqual({ kind: 'known', format: 'gif' });
    expect(sniff(new Uint8Array(await base.clone().tiff().toBuffer()))).toEqual({ kind: 'known', format: 'tiff' });
  });

  it('distinguishes ISO-BMFF brands', () => {
    expect(sniff(ftyp('isom', ['isom', 'avc1']))).toEqual({ kind: 'known', format: 'mp4' });
    expect(sniff(ftyp('qt  '))).toEqual({ kind: 'known', format: 'mov' });
    expect(sniff(ftyp('M4V '))).toEqual({ kind: 'known', format: 'm4v' });
    expect(sniff(ftyp('M4A '))).toEqual({ kind: 'known', format: 'm4a' });
    expect(sniff(ftyp('3gp5'))).toEqual({ kind: 'known', format: '3gp' });
    expect(sniff(ftyp('heic', ['mif1', 'heic']))).toEqual({ kind: 'known', format: 'heic' });
    expect(sniff(ftyp('mif1', ['avif', 'mif1']))).toEqual({ kind: 'known', format: 'avif' });
  });

  it('detects matroska vs webm, RIFF variants, ogg and mp3', () => {
    expect(sniff(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], 'webm'))).toEqual({ kind: 'known', format: 'webm' });
    expect(sniff(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], 'matroska'))).toEqual({ kind: 'known', format: 'mkv' });
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'AVI LIST'))).toEqual({ kind: 'known', format: 'avi' });
    expect(sniff(bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '))).toEqual({ kind: 'known', format: 'wav' });
    expect(sniff(bytes('ID3', [4, 0, 0, 0, 0, 0, 0]))).toEqual({ kind: 'known', format: 'mp3' });
    const ogg = new Uint8Array(40);
    ogg.set(bytes('OggS'), 0);
    ogg.set(bytes('OpusHead'), 28);
    expect(sniff(ogg)).toEqual({ kind: 'known', format: 'opus' });
  });

  it('rejects playlists and concat lists, recognises SVG', () => {
    expect(sniff(bytes('#EXTM3U\n#EXT-X-VERSION:3\n'))).toEqual({ kind: 'rejected', format: 'hls-playlist' });
    expect(sniff(bytes('ffconcat version 1.0\nfile /etc/passwd\n'))).toEqual({ kind: 'rejected', format: 'ffconcat' });
    expect(sniff(bytes('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toEqual({
      kind: 'known',
      format: 'svg',
    });
  });

  it('returns unknown for random or tiny data', () => {
    expect(sniff(new Uint8Array([1, 2]))).toEqual({ kind: 'unknown' });
    expect(sniff(bytes('hello world, not media'))).toEqual({ kind: 'unknown' });
  });

  it('ignores the file name: a PNG renamed to .jpg is still PNG', async () => {
    const png = new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer());
    expect(sniff(png)).toEqual({ kind: 'known', format: 'png' });
  });
});
