import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { download, runTool, skipWithoutOffscreenCanvas, upload } from './helpers';

const meta = (bytes: Buffer) => sharp(bytes).metadata();

test.describe('image tools', () => {
  test.beforeEach(({ page }) => skipWithoutOffscreenCanvas(page));

  test('converts transparent PNG to JPG with a background colour and warns first', async ({ page }) => {
    await page.goto('/image/convert');
    await expect(page.getByTestId('processing-badge')).toBeVisible();
    await upload(page, 'transparent.png');
    await expect(page.getByText('Transparency')).toBeVisible();
    await page.getByLabel('Output format').selectOption('jpeg');
    await expect(page.getByText(/has no transparency, so they will be filled/)).toBeVisible();
    await runTool(page);
    const { bytes, name } = await download(page);
    expect(name).toBe('transparent-converted.jpg');
    const m = await meta(bytes);
    expect(m.format).toBe('jpeg');
    expect([m.width, m.height]).toEqual([400, 300]);
    // A pixel in the transparent area is white (default background), not black.
    const { data } = await sharp(bytes).extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
  });

  for (const format of ['png', 'webp', 'avif', 'gif', 'bmp'] as const) {
    test(`converts JPG to ${format.toUpperCase()} and verifies the real output format`, async ({ page }) => {
      await page.goto('/image/convert');
      await upload(page, 'photo.jpg');
      await page.getByLabel('Output format').selectOption(format);
      await runTool(page);
      const { bytes, name } = await download(page);
      expect(name).toMatch(new RegExp(`photo-converted\\.${format}$`));
      if (format === 'bmp') {
        expect(bytes.subarray(0, 2).toString('ascii')).toBe('BM');
        expect(bytes.readInt32LE(18)).toBe(1200);
        expect(bytes.readInt32LE(22)).toBe(800);
      } else {
        const m = await meta(bytes);
        expect(m.format).toBe(format === 'avif' ? 'heif' : format);
        expect([m.width, m.height]).toEqual([1200, 800]);
      }
    });
  }

  test('applies EXIF orientation before converting', async ({ page }) => {
    await page.goto('/image/convert');
    await upload(page, 'exif-rotated.jpg');
    await expect(page.getByText('200 × 300 px')).toBeVisible();
    await page.getByLabel('Output format').selectOption('png');
    await runTool(page);
    const { bytes } = await download(page);
    const img = sharp(bytes);
    expect(await img.metadata()).toMatchObject({ width: 200, height: 300 });
    // Orientation 6 rotates the red left half to the top.
    const top = await sharp(bytes).extract({ left: 100, top: 20, width: 1, height: 1 }).raw().toBuffer();
    expect(top[0]).toBeGreaterThan(200);
    expect(top[2]).toBeLessThan(60);
  });

  test('compresses with a target size and reports the achieved size', async ({ page }) => {
    await page.goto('/image/compress');
    await upload(page, 'photo.jpg');
    await page.getByRole('switch', { name: 'Target file size' }).click();
    await page.getByLabel('Target', { exact: true }).fill('60');
    await runTool(page);
    const { bytes, name } = await download(page);
    expect(name).toBe('photo-compressed.jpg');
    expect(bytes.byteLength).toBeLessThanOrEqual(60_000);
    await expect(page.getByTestId('result-card').getByText(/Target size/)).toBeVisible();
    await expect(page.getByTestId('output-size')).toHaveText(/KB/);
  });

  test('crops to exact full-resolution pixels via the numeric inputs', async ({ page }) => {
    await page.goto('/image/crop');
    await upload(page, 'photo.jpg');
    await expect(page.getByTestId('crop-area')).toBeVisible();
    await page.getByLabel('X', { exact: true }).fill('101');
    await page.getByLabel('Y', { exact: true }).fill('50');
    await page.getByLabel('Width', { exact: true }).fill('333');
    await page.getByLabel('Height', { exact: true }).fill('211');
    await page.getByLabel('Output format').selectOption('png');
    await runTool(page);
    const { bytes } = await download(page);
    expect(await meta(bytes)).toMatchObject({ width: 333, height: 211 });
    // Compare one pixel with the same location in the source (lossless PNG → exact match within JPEG decode noise).
    const src = await sharp('tests/fixtures/generated/photo.jpg').extract({ left: 101 + 10, top: 50 + 10, width: 1, height: 1 }).raw().toBuffer();
    const out = await sharp(bytes).extract({ left: 10, top: 10, width: 1, height: 1 }).raw().toBuffer();
    for (let i = 0; i < 3; i++) expect(Math.abs(src[i]! - out[i]!)).toBeLessThanOrEqual(3);
  });

  test('crop selection is keyboard operable', async ({ page }) => {
    await page.goto('/image/crop');
    await upload(page, 'photo.jpg');
    const area = page.getByTestId('crop-area');
    await expect(area).toBeVisible();
    await page.getByLabel('Width', { exact: true }).fill('600');
    await area.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('X', { exact: true })).not.toHaveValue('0');
    const before = await page.getByLabel('Width', { exact: true }).inputValue();
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.getByLabel('Width', { exact: true })).not.toHaveValue(before);
  });

  test('rotates 90° and applies a 1:1 crop', async ({ page }) => {
    await page.goto('/image/crop');
    await upload(page, 'photo.jpg');
    await page.getByRole('button', { name: 'Rotate right 90°' }).click();
    await page.getByLabel('Aspect ratio').selectOption('1:1');
    await expect(page.getByLabel('Width', { exact: true })).toHaveValue('800');
    await runTool(page);
    const { bytes } = await download(page);
    expect(await meta(bytes)).toMatchObject({ width: 800, height: 800 });
  });

  test('resizes by percentage with Lanczos', async ({ page }) => {
    await page.goto('/image/resize');
    await upload(page, 'photo.png');
    await expect(page.getByTestId('resize-preview')).toContainText('600 × 400');
    await runTool(page);
    const { bytes, name } = await download(page);
    expect(name).toBe('photo-resized.png');
    expect(await meta(bytes)).toMatchObject({ width: 600, height: 400, format: 'png' });
  });

  test('reports compression that makes a file larger and offers Keep original', async ({ page }) => {
    await page.goto('/image/compress');
    await upload(page, 'tiny-1x1.png');
    await page.getByLabel('Output format').selectOption('avif');
    await runTool(page);
    await expect(page.getByText(/larger/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep original' })).toBeVisible();
  });
});
