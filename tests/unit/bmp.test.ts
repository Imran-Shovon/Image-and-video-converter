import { describe, expect, it } from 'vitest';
import { encodeBmp } from '@/lib/image-processing/bmp';

describe('encodeBmp', () => {
  it('writes a valid 24-bit bottom-up BMP with padded rows', () => {
    // 3×2 image: top row red, green, blue; bottom row white, black, grey.
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255]);
    const bmp = encodeBmp(rgba, 3, 2);
    const view = new DataView(bmp.buffer);
    const rowSize = 12; // 3 px × 3 bytes = 9, padded to 12
    expect(String.fromCharCode(bmp[0]!, bmp[1]!)).toBe('BM');
    expect(view.getUint32(2, true)).toBe(bmp.length);
    expect(bmp.length).toBe(54 + rowSize * 2);
    expect(view.getInt32(18, true)).toBe(3);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);
    // First stored row is the bottom image row (white, black, grey) in BGR order.
    expect(Array.from(bmp.subarray(54, 63))).toEqual([255, 255, 255, 0, 0, 0, 128, 128, 128]);
    // Second stored row is the top image row (red, green, blue).
    expect(Array.from(bmp.subarray(54 + rowSize, 54 + rowSize + 9))).toEqual([0, 0, 255, 0, 255, 0, 255, 0, 0]);
  });
});
