// Covers every input/output pair marked "tested" in the capability matrix that other specs don't exercise.
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { download, probeDownload, runTool, skipWithoutOffscreenCanvas, upload } from './helpers';

test.describe('image input formats', () => {
  test.beforeEach(({ page }) => skipWithoutOffscreenCanvas(page));

  const inputs: [string, number, number][] = [
    ['photo.webp', 1200, 800],
    ['transparent.webp', 400, 300],
    ['photo.avif', 1200, 800],
    ['animated.gif', 64, 48],
    ['animated.webp', 64, 48],
    ['photo.bmp', 320, 240],
    ['cmyk.jpg', 400, 300],
    ['display-p3.jpg', 300, 200],
    ['odd-301x201.png', 301, 201],
    ['tiny-1x1.png', 1, 1],
  ];
  for (const [file, width, height] of inputs) {
    test(`reads ${file} and converts it to PNG`, async ({ page }) => {
      await page.goto('/image/convert');
      await upload(page, file);
      await page.getByLabel('Output format').selectOption('png');
      if (file.startsWith('animated')) await expect(page.getByText(/Only the first frame will be converted/)).toBeVisible();
      await runTool(page);
      const { bytes } = await download(page);
      expect(await sharp(bytes).metadata()).toMatchObject({ format: 'png', width, height });
    });
  }

  test('PNG palette mode produces an indexed PNG', async ({ page }) => {
    await page.goto('/image/compress');
    await upload(page, 'photo.png');
    await page.getByLabel('Output format').selectOption('png');
    await page.getByRole('radio', { name: 'Palette (lossy)' }).click();
    await runTool(page);
    const { bytes } = await download(page);
    const m = await sharp(bytes).metadata();
    expect(m.format).toBe('png');
    expect(m.isPalette).toBe(true);
    expect(bytes.byteLength).toBeLessThan(2_218_487);
  });
});

test.describe('video input and output formats', () => {
  test.describe.configure({ timeout: 240_000 });

  for (const file of ['vp9-opus.webm', 'hevc.mp4', 'h264.mkv', 'clip.m4v']) {
    test(`reads ${file} and converts it to MP4 (H.264)`, async ({ page }) => {
      await page.goto('/video/convert');
      await upload(page, file);
      await page.getByLabel('Output format').selectOption('mp4-h264');
      const copy = page.getByRole('switch', { name: /Change container only/ });
      if ((await copy.count()) && (await copy.isChecked())) await copy.click();
      await page.getByLabel('Engine').selectOption('ffmpeg');
      await runTool(page, 150_000);
      const { download: dl } = await download(page);
      const banner = await probeDownload(dl);
      expect(banner).toMatch(/Video: h264/);
      expect(banner).toMatch(/320x240/);
    });
  }

  test('encodes MOV (H.264 + AAC)', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'vp9-opus.webm');
    await page.getByLabel('Output format').selectOption('mov-h264');
    await runTool(page, 150_000);
    const { download: dl, name } = await download(page);
    expect(name).toMatch(/\.mov$/);
    const banner = await probeDownload(dl);
    expect(banner).toMatch(/major_brand\s+: qt/);
    expect(banner).toMatch(/Audio: aac/);
  });

  for (const [format, codec] of [
    ['m4a', 'aac'],
    ['wav', 'pcm_s16le'],
    ['opus', 'opus'],
  ] as const) {
    test(`extracts audio as ${format.toUpperCase()}`, async ({ page }) => {
      await page.goto('/video/extract-audio');
      await upload(page, 'h264-aac.mp4');
      await page.getByLabel('Audio format').selectOption(format);
      await runTool(page, 150_000);
      const { download: dl, name } = await download(page);
      expect(name).toBe(`h264-aac-audio.${format}`);
      expect(await probeDownload(dl)).toMatch(new RegExp(`Audio: ${codec}`));
    });
  }
});
