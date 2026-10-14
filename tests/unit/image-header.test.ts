import { describe, expect, it } from 'vitest';
import sharp, { type Sharp } from 'sharp';
import { GIFEncoder } from 'gifenc';
import { readImageHeader } from '@/lib/media/image-header';
import { encodeBmp } from '@/lib/image-processing/bmp';

const create = (width: number, height: number) => sharp({ create: { width, height, channels: 4, background: '#33669980' } });
const buf = async (s: Sharp) => new Uint8Array(await s.toBuffer());

describe('readImageHeader', () => {
  it('reads dimensions of real PNG, JPEG, WebP, AVIF, GIF files', async () => {
    expect(readImageHeader('png', await buf(create(31, 17).png()))).toMatchObject({ width: 31, height: 17, animated: false });
    expect(readImageHeader('jpeg', await buf(create(640, 481).jpeg()))).toMatchObject({ width: 640, height: 481, orientation: 1 });
    expect(readImageHeader('webp', await buf(create(1001, 3).webp()))).toMatchObject({ width: 1001, height: 3 });
    expect(readImageHeader('webp', await buf(create(77, 55).webp({ lossless: true })))).toMatchObject({ width: 77, height: 55 });
    expect(readImageHeader('avif', await buf(create(120, 64).avif()))).toMatchObject({ width: 120, height: 64 });
    expect(readImageHeader('gif', await buf(create(9, 8).gif()))).toMatchObject({ width: 9, height: 8, animated: false });
  });

  it('reads EXIF orientation from JPEG', async () => {
    const jpeg = await buf(create(40, 20).jpeg().withMetadata({ orientation: 6 }));
    expect(readImageHeader('jpeg', jpeg)).toMatchObject({ width: 40, height: 20, orientation: 6 });
  });

  it('detects animated GIF and WebP', async () => {
    const enc = GIFEncoder();
    enc.writeFrame(new Uint8Array(16), 4, 4, { palette: [[0, 0, 0], [255, 255, 255]] });
    enc.writeFrame(new Uint8Array(16).fill(1), 4, 4, { delay: 100 });
    enc.finish();
    const gif = enc.bytes();
    expect(readImageHeader('gif', gif)).toMatchObject({ width: 4, height: 4, animated: true });

    const animatedWebp = await buf(sharp(gif, { animated: true }).webp());
    expect(readImageHeader('webp', animatedWebp)).toMatchObject({ width: 4, height: 4, animated: true });
  });

  it('reads BMP dimensions (including top-down negative height)', () => {
    const bmp = encodeBmp(new Uint8Array(5 * 3 * 4), 5, 3);
    expect(readImageHeader('bmp', bmp)).toMatchObject({ width: 5, height: 3 });
    const view = new DataView(bmp.buffer);
    view.setInt32(22, -3, true);
    expect(readImageHeader('bmp', bmp)).toMatchObject({ width: 5, height: 3 });
  });

  it('returns null for truncated data', async () => {
    const png = await buf(create(10, 10).png());
    expect(readImageHeader('png', png.subarray(0, 10))).toBeNull();
    expect(readImageHeader('jpeg', new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
  });
});

describe('looksTruncated', () => {
  it('flags images whose end-of-image marker is missing', async () => {
    const { looksTruncated } = await import('@/lib/media/validate');
    const jpeg = await buf(create(64, 64).jpeg());
    const png = await buf(create(64, 64).png());
    expect(looksTruncated('jpeg', jpeg.subarray(-4096))).toBe(false);
    expect(looksTruncated('jpeg', jpeg.subarray(0, jpeg.length - 10))).toBe(true);
    expect(looksTruncated('png', png)).toBe(false);
    expect(looksTruncated('png', png.subarray(0, png.length - 20))).toBe(true);
  });
});
