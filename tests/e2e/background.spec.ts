// Background removal needs WebGPU. Playwright's bundled browsers usually have none (Chromium on Windows
// fails to create a device), so the full test runs in the `edge-webgpu` project (system Edge) and every
// other project checks the "not available" path instead.
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { download, runTool, upload } from './helpers';

const hasWebGpu = (page: Page) =>
  page.evaluate(async () => {
    try {
      return !!(await navigator.gpu?.requestAdapter());
    } catch {
      return false;
    }
  });

test.describe('remove background', () => {
  test.describe.configure({ timeout: 600_000 });

  test('cuts out the subject into a transparent PNG at full resolution', async ({ page }) => {
    await page.goto('/image/remove-background');
    test.skip(!(await hasWebGpu(page)), 'No WebGPU adapter in this browser');
    await upload(page, 'subject.jpg');
    await expect(page.getByText(/downloads the BiRefNet-lite AI model/)).toBeVisible();
    // First run downloads ~115 MB and compiles GPU shaders.
    await runTool(page, 540_000);
    const { bytes, name } = await download(page);
    expect(name).toBe('subject-no-background.png');
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([800, 600]);
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]!;
    expect(alphaAt(400, 330)).toBe(255); // centre of the ball
    expect(alphaAt(250, 330)).toBeGreaterThan(200); // inside the left edge
    expect(alphaAt(20, 20)).toBe(0); // background corner
    expect(alphaAt(780, 40)).toBe(0);

    // Second run uses the cached model and a solid background colour.
    await page.getByRole('radio', { name: 'Solid colour' }).click();
    await page.getByLabel('Output format').selectOption('jpeg');
    await page.getByTestId('process').click();
    await expect(page.getByTestId('result-card')).toBeHidden();
    await expect(page.getByTestId('result-card')).toBeVisible({ timeout: 240_000 });
    const second = await download(page);
    expect(second.name).toBe('subject-no-background.jpg');
    const flat = await sharp(second.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(flat.info.channels).toBe(3);
    const px = (x: number, y: number) => Array.from(flat.data.subarray((y * flat.info.width + x) * 3, (y * flat.info.width + x) * 3 + 3));
    for (const v of px(20, 20)) expect(v).toBeGreaterThan(245); // white background
    expect(px(400, 330)[0]).toBeGreaterThan(150); // red ball kept
  });

  test('explains that WebGPU is needed when it is missing', async ({ page }) => {
    await page.goto('/image/remove-background');
    test.skip(await hasWebGpu(page), 'WebGPU is available here');
    await upload(page, 'photo.jpg');
    await expect(page.getByText(/needs WebGPU/)).toBeVisible();
    await expect(page.getByTestId('process')).toBeDisabled();
  });
});
