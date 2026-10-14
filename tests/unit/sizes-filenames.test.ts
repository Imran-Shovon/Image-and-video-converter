import { describe, expect, it } from 'vitest';
import { dedupeFilename, outputFilename, sanitizeBaseName } from '@/lib/media/filenames';
import { formatBytes, formatDuration, parseTimecode, sizeChange } from '@/lib/media/sizes';

describe('sizes', () => {
  it('formats decimal units', () => {
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(2_340_000)).toBe('2.34 MB');
    expect(formatBytes(1_000_000_000)).toBe('1 GB');
  });

  it('computes reduction and increase', () => {
    expect(sizeChange(1000, 250)).toMatchObject({ reductionPercent: 75, larger: false, label: '75% smaller' });
    expect(sizeChange(1000, 1120)).toMatchObject({ larger: true, label: '+12% larger' });
    expect(sizeChange(1000, 1000).label).toBe('Same size');
  });

  it('formats and parses timecodes', () => {
    expect(formatDuration(62.5, true)).toBe('1:02.500');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(parseTimecode('1:02.5')).toBe(62.5);
    expect(parseTimecode('00:01:02.250')).toBe(62.25);
    expect(parseTimecode('12')).toBe(12);
    expect(parseTimecode('abc')).toBeNull();
  });
});

describe('filenames', () => {
  it('builds {name}-{operation}.{ext}', () => {
    expect(outputFilename('Holiday Photo.JPG', 'compressed', 'webp')).toBe('Holiday Photo-compressed.webp');
  });

  it('strips unsafe characters, paths and reserved names', () => {
    expect(sanitizeBaseName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeBaseName('C:\\Users\\me\\a<b>:c"d|e?f*.png')).toBe('abcdef');
    expect(sanitizeBaseName('CON.txt')).toBe('CON_');
    expect(sanitizeBaseName('...')).toBe('file');
    expect(sanitizeBaseName('evil\u202Egpj.exe')).toBe('evilgpj');
  });

  it('keeps Unicode names intact', () => {
    expect(outputFilename('ছবি 写真 фото.png', 'crop', 'png')).toBe('ছবি 写真 фото-crop.png');
  });

  it('dedupes names case-insensitively', () => {
    const taken = new Set<string>();
    expect(dedupeFilename('a.png', taken)).toBe('a.png');
    expect(dedupeFilename('A.png', taken)).toBe('A (2).png');
    expect(dedupeFilename('a.png', taken)).toBe('a (3).png');
  });
});
