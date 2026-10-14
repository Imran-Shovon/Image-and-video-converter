import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { download, durationOf, probeDownload, runTool, upload, skipWithoutOffscreenCanvas } from './helpers';

const VIDEO_TIMEOUT = 150_000;

async function useCompatibleEngine(page: Page) {
  const engine = page.getByLabel('Engine');
  if (await engine.count()) await engine.selectOption('ffmpeg');
}

test.describe('video tools', () => {
  test.describe.configure({ timeout: 240_000 });

  test('page is cross-origin isolated (SharedArrayBuffer available)', async ({ page }) => {
    await page.goto('/video/convert');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  });

  test('converts MP4 to WebM (VP8 + Vorbis) with ffmpeg.wasm', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'h264-aac.mp4');
    await expect(page.getByText('H264 · 640 × 360')).toBeVisible();
    await page.getByLabel('Output format').selectOption('webm-vp8');
    await page.getByRole('radio', { name: 'Small' }).click();
    await useCompatibleEngine(page);
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl, name } = await download(page);
    expect(name).toBe('h264-aac-converted.webm');
    const banner = await probeDownload(dl);
    expect(banner).toMatch(/Video: vp8/);
    expect(banner).toMatch(/Audio: vorbis/);
    expect(durationOf(banner)!).toBeCloseTo(3, 0);
  });

  test('converts MP4 to WebM (VP9 + Opus) with WebCodecs where available', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'h264-aac.mp4');
    await expect(page.getByText('H264 · 640 × 360')).toBeVisible();
    // The VP9 encoder check is asynchronous; give it a moment before reading the option state.
    await page.waitForTimeout(1000);
    const vp9 = page.locator('option[value="webm-vp9"]');
    test.skip(await vp9.isDisabled(), 'This browser has no WebCodecs VP9 encoder');
    await page.getByLabel('Output format').selectOption('webm-vp9');
    await runTool(page, VIDEO_TIMEOUT);
    await expect(page.getByTestId('result-card')).toContainText('WebCodecs');
    const { download: dl } = await download(page);
    const banner = await probeDownload(dl);
    expect(banner).toMatch(/Video: vp9/);
    expect(banner).toMatch(/Audio: opus/);
    expect(durationOf(banner)!).toBeCloseTo(3, 0);
  });

  test('changes container only (stream copy) from MOV to MP4', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'h264.mov');
    await page.getByLabel('Output format').selectOption('mp4-h264');
    await expect(page.getByRole('switch', { name: /Change container only/ })).toBeChecked();
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl, name } = await download(page);
    expect(name).toBe('h264-converted.mp4');
    const banner = await probeDownload(dl);
    expect(banner).toMatch(/major_brand\s+: isom/);
    expect(banner).toMatch(/Video: h264/);
  });

  test('compresses to a target size with two-pass encoding', async ({ page }) => {
    await page.goto('/video/compress');
    await upload(page, 'h264-aac.mp4');
    await page.getByRole('radio', { name: 'Target size' }).click();
    await page.getByLabel('Target size').fill('0.15');
    await expect(page.getByTestId('bitrate-plan')).toBeVisible();
    await runTool(page, VIDEO_TIMEOUT);
    const { bytes } = await download(page);
    // Best effort: within 25% of the target.
    expect(bytes.byteLength).toBeLessThan(150_000 * 1.25);
  });

  test('precise trim is frame-accurate', async ({ page }) => {
    await page.goto('/video/trim');
    await upload(page, 'h264-aac.mp4');
    await expect(page.getByLabel('Trim start')).toBeVisible();
    await page.getByLabel('Start', { exact: true }).fill('0:00.500');
    await page.getByLabel('Start', { exact: true }).press('Enter');
    await page.getByLabel('End', { exact: true }).fill('0:02.000');
    await page.getByLabel('End', { exact: true }).press('Enter');
    await expect(page.getByTestId('trim-length')).toHaveText('0:01.500');
    await useCompatibleEngine(page);
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl } = await download(page);
    expect(Math.abs(durationOf(await probeDownload(dl))! - 1.5)).toBeLessThanOrEqual(0.1);
  });

  test('fast trim copies streams and warns about keyframes', async ({ page }) => {
    await page.goto('/video/trim');
    await upload(page, 'h264-aac.mp4');
    await page.getByRole('radio', { name: 'Fast (lossless)' }).click();
    await expect(page.getByText(/snap to the nearest keyframe/)).toBeVisible();
    await page.getByLabel('Start', { exact: true }).fill('0:01.000');
    await page.getByLabel('Start', { exact: true }).press('Enter');
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl } = await download(page);
    const d = durationOf(await probeDownload(dl))!;
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThanOrEqual(3.05);
  });

  test('crops video with even-dimension snapping', async ({ page }) => {
    await page.goto('/video/crop');
    await upload(page, 'h264-aac.mp4');
    await expect(page.getByTestId('crop-summary')).toBeVisible();
    await page.getByLabel('Width', { exact: true }).fill('301');
    await page.getByLabel('Height', { exact: true }).fill('201');
    await expect(page.getByTestId('crop-summary')).toContainText('Crop 300 × 200');
    await useCompatibleEngine(page);
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl } = await download(page);
    expect(await probeDownload(dl)).toMatch(/300x200/);
  });

  test('rotates video 90° (output dimensions swap)', async ({ page }) => {
    await page.goto('/video/resize');
    await upload(page, 'h264-aac.mp4');
    await page.getByRole('button', { name: 'Rotate right 90°' }).click();
    await expect(page.getByTestId('output-dimensions')).toContainText('360 × 640');
    await useCompatibleEngine(page);
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl } = await download(page);
    expect(await probeDownload(dl)).toMatch(/360x640/);
  });

  test('respects phone rotation metadata', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'rotated.mp4');
    await expect(page.getByText(/360 × 640 \(rotated (90|270)°\)/)).toBeVisible();
    await page.getByRole('switch', { name: /Change container only/ }).click();
    await useCompatibleEngine(page);
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl } = await download(page);
    expect(await probeDownload(dl)).toMatch(/360x640/);
  });

  test('extracts audio as MP3', async ({ page }) => {
    await page.goto('/video/extract-audio');
    await upload(page, 'h264-aac.mp4');
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl, name } = await download(page);
    expect(name).toBe('h264-aac-audio.mp3');
    const banner = await probeDownload(dl);
    expect(banner).toMatch(/Audio: mp3/);
    expect(banner).not.toMatch(/Video:/);
  });

  test('explains when there is no audio to extract', async ({ page }) => {
    await page.goto('/video/extract-audio');
    await upload(page, 'no-audio.mp4');
    await expect(page.getByText(/no audio track/)).toBeVisible();
    await expect(page.getByTestId('process')).toBeDisabled();
  });

  test('removes audio without re-encoding', async ({ page }) => {
    await page.goto('/video/remove-audio');
    await upload(page, 'h264-aac.mp4');
    await runTool(page, VIDEO_TIMEOUT);
    const { download: dl } = await download(page);
    const banner = await probeDownload(dl);
    expect(banner).toMatch(/Video: h264/);
    expect(banner).not.toMatch(/Audio:/);
  });

  test('saves a thumbnail frame as JPG at full resolution', async ({ page }) => {
    await skipWithoutOffscreenCanvas(page); // the frame is encoded by the image worker
    await page.goto('/video/thumbnail');
    await upload(page, 'h264-aac.mp4');
    await runTool(page, VIDEO_TIMEOUT);
    const { bytes, name } = await download(page);
    expect(name).toBe('h264-aac-frame.jpg');
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'jpeg', width: 640, height: 360 });
  });

  test('creates a GIF from a clip', async ({ page }) => {
    await page.goto('/video/gif');
    await upload(page, 'h264-aac.mp4');
    await runTool(page, VIDEO_TIMEOUT);
    const { bytes } = await download(page);
    const m = await sharp(bytes, { animated: true }).metadata();
    expect(m.format).toBe('gif');
    expect(m.width).toBe(480);
    expect(m.pages).toBeGreaterThan(10);
  });

  test('handles MKV, multiple audio tracks and VFR input', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'multi-audio.mkv');
    await expect(page.getByText('2 (first is used)')).toBeVisible();
    await page.getByRole('switch', { name: /Change container only/ }).click();
    await useCompatibleEngine(page);
    await runTool(page, VIDEO_TIMEOUT);
    await expect(page.getByTestId('result-notes')).toContainText('Only the first of 2 audio tracks');
    await page.getByRole('button', { name: 'Start over' }).click();
    await upload(page, 'vfr.mp4');
    await expect(page.getByText(/variable frame rate/).first()).toBeVisible();
  });

  test('rejects a truncated video with a clear message', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'truncated.mp4');
    await expect(page.getByRole('alert')).toContainText(/damaged|incomplete|could not be read/i);
  });

  test('cancels a running job, keeps the file and can retry', async ({ page }) => {
    await page.goto('/video/convert');
    await upload(page, 'long-720p.mp4');
    await page.getByLabel('Output format').selectOption('webm-vp8');
    await page.getByRole('radio', { name: 'High' }).click();
    await useCompatibleEngine(page);
    await page.getByTestId('process').click();
    await expect(page.getByRole('progressbar', { name: /Processing|Downloading|Loading/ })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('alert')).toContainText('Cancelled');
    await page.getByLabel('Resolution').selectOption('360');
    await page.getByRole('radio', { name: 'Small' }).click();
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('result-card')).toBeVisible({ timeout: VIDEO_TIMEOUT });
  });
});
