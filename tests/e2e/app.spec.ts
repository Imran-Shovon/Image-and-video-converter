import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { inflateRawSync } from 'node:zlib';
import sharp from 'sharp';
import { download, runTool, skipWithoutOffscreenCanvas, upload } from './helpers';

/** Minimal ZIP reader (stored or deflated entries) for checking batch downloads. */
function readZip(buf: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(off + 10);
    let size = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    let local = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
    // ZIP64: sizes/offsets live in the extra field when set to 0xFFFFFFFF.
    const extra = buf.subarray(off + 46 + nameLen, off + 46 + nameLen + extraLen);
    if (size === 0xffffffff || local === 0xffffffff) {
      let e = 4;
      if (buf.readUInt32LE(off + 24) === 0xffffffff) e += 8;
      if (size === 0xffffffff) {
        size = Number(extra.readBigUInt64LE(e));
        e += 8;
      }
      if (local === 0xffffffff) local = Number(extra.readBigUInt64LE(e));
    }
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(dataStart, dataStart + size);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

test.describe('validation and errors', () => {
  const cases: [string, RegExp][] = [
    ['empty.png', /Empty file/],
    ['truncated.jpg', /end of the file is missing/],
    ['script.svg', /SVG files aren[’']t supported/],
    ['playlist.m3u8', /Playlist and concat files/],
    ['concat.txt', /Playlist and concat files/],
    ['random.bin', /couldn[’']t recognise/],
    ['bomb-20000x20000.png', /20000×20000/],
    ['h264-aac.mp4', /This is a video/],
  ];
  for (const [file, message] of cases) {
    test(`rejects ${file} with a specific message`, async ({ page }) => {
      await page.goto('/image/convert');
      await upload(page, file);
      await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    });
  }

  test('detects a PNG with a .jpg name by its contents', async ({ page }) => {
    await skipWithoutOffscreenCanvas(page);
    await page.goto('/image/convert');
    await upload(page, 'png-named.jpg');
    await expect(page.getByText(/PNG \(extension doesn’t match content\)/)).toBeVisible();
  });
});

test('explains when the browser cannot process images', async ({ page }) => {
  const available = await page.evaluate(() => typeof OffscreenCanvas !== 'undefined');
  test.skip(available, 'OffscreenCanvas is available here');
  await page.goto('/image/convert');
  await upload(page, 'photo.jpg');
  await expect(page.getByRole('alert')).toContainText('OffscreenCanvas is missing');
});

test.describe('batch processing', () => {
  test('converts several files, isolates failures and downloads a ZIP', async ({ page }) => {
    await skipWithoutOffscreenCanvas(page);
    await page.goto('/image/convert');
    await upload(page, 'photo.jpg', 'transparent.png', 'truncated.jpg', 'odd-301x201.png');
    const list = page.getByTestId('batch-list');
    await expect(list.getByRole('listitem')).toHaveCount(4);
    await page.getByLabel('Output format').selectOption('webp');
    await page.getByTestId('process').click();
    await expect(list.getByText('Failed')).toHaveCount(1);
    await expect(list.getByText(/smaller|larger|Same size/)).toHaveCount(3, { timeout: 60_000 });
    const { bytes, name } = await download(page, 'download-zip');
    expect(name).toBe('converted-images.zip');
    const files = readZip(bytes);
    expect([...files.keys()].sort()).toEqual(['FAILED-FILES.txt', 'odd-301x201-converted.webp', 'photo-converted.webp', 'transparent-converted.webp']);
    expect((await sharp(files.get('odd-301x201-converted.webp')!).metadata()).width).toBe(301);
    expect(files.get('FAILED-FILES.txt')!.toString()).toContain('truncated.jpg');
  });
});

test.describe('navigation, chaining and preferences', () => {
  test('homepage detects a dropped file and opens the chosen tool with it', async ({ page }) => {
    await page.goto('/');
    await upload(page, 'photo.jpg');
    await expect(page.getByText(/JPG image, 279/)).toBeVisible();
    await page.getByRole('button', { name: /Compress image/ }).click();
    await expect(page).toHaveURL(/\/image\/compress$/);
    await expect(page.getByRole('heading', { name: 'photo.jpg' })).toBeVisible();
  });

  test('continues from crop to compress without re-uploading', async ({ page }) => {
    await skipWithoutOffscreenCanvas(page);
    await page.goto('/image/crop');
    await upload(page, 'photo.jpg');
    await page.getByLabel('Width', { exact: true }).fill('500');
    await runTool(page);
    await page.getByRole('button', { name: /Continue with/ }).click();
    await page.getByRole('menuitem', { name: 'Compress image' }).click();
    await expect(page).toHaveURL(/\/image\/compress$/);
    await expect(page.getByText('500 × 800 px')).toBeVisible();
  });

  test('remembers tool settings and theme across reloads', async ({ page }) => {
    await page.goto('/image/convert');
    await upload(page, 'photo.jpg');
    await page.getByLabel('Output format').selectOption('png');
    await page.getByRole('button', { name: /^Theme: light/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await upload(page, 'photo.jpg');
    await expect(page.getByLabel('Output format')).toHaveValue('png');
  });

  test('formats page is generated from the capability matrix', async ({ page }) => {
    await page.goto('/formats');
    await expect(page.getByRole('heading', { name: 'Supported formats' })).toBeVisible();
    await expect(page.getByRole('row', { name: /SVG.*Not supported/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /AV1 encoding.*Not supported/ })).toBeVisible();
  });
});

test.describe('accessibility', () => {
  for (const path of ['/', '/image/convert', '/video/trim', '/formats', '/privacy']) {
    test(`has no axe violations on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    });
  }

  test('tool page with a loaded file has no axe violations, in dark mode too', async ({ page }) => {
    await skipWithoutOffscreenCanvas(page);
    await page.goto('/image/compress');
    await upload(page, 'photo.jpg');
    await expect(page.getByTestId('process')).toBeEnabled();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await page.waitForTimeout(400); // let colour transitions finish before measuring contrast
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${theme} ${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
    }
  });

  test('works on a phone-sized screen @mobile', async ({ page }) => {
    await skipWithoutOffscreenCanvas(page);
    await page.goto('/image/convert');
    await upload(page, 'photo.jpg');
    await runTool(page);
    const { bytes } = await download(page);
    expect((await sharp(bytes).metadata()).format).toBe('webp');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});
