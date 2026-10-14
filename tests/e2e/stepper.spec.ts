import { expect, test } from '@playwright/test';
import { download, runTool, upload } from './helpers';

test('home stepper returns to upload and keeps the selected file @mobile', async ({ page }) => {
  await page.goto('/');
  const steps = page.getByRole('list', { name: 'Your progress' });
  await expect(steps.getByRole('button', { name: /Choose & edit/ })).toBeDisabled();
  await expect(steps.getByRole('button', { name: /Download/ })).toBeDisabled();
  await upload(page, 'empty.png');
  await expect(page.getByRole('alert')).toContainText('Empty file');
  await expect(steps.getByRole('button', { name: /Choose & edit/ })).toBeDisabled();
  await upload(page, 'photo.jpg');
  await steps.getByRole('button', { name: /Upload a file/ }).click();
  await expect(page.getByRole('heading', { name: 'Upload an image or video' })).toBeVisible();
  await expect(page.getByText('Selected: photo.jpg')).toBeVisible();
  await expect(steps.getByRole('button', { name: /Choose & edit/ })).toBeEnabled();
  await expect(steps.getByRole('button', { name: /Download/ })).toBeDisabled();
  await steps.getByRole('button', { name: /Choose & edit/ }).click();
  await expect(page.getByRole('button', { name: /Convert image/ })).toBeVisible();
  await expect(page.getByText('photo.jpg', { exact: true })).toBeVisible();
});

test('image stepper navigates all steps without losing settings or output @mobile', async ({
  page,
}) => {
  await page.goto('/image/convert');
  await upload(page, 'photo.jpg');
  await expect(page.getByTestId('process')).toBeEnabled();
  await page.getByLabel('Output format').selectOption('png');
  const steps = page.getByRole('list', { name: 'Your progress' });
  await expect(steps.getByRole('button', { name: /Download/ })).toBeDisabled();
  await runTool(page);
  const result = page.getByTestId('result-card');
  const resultUrl = await result
    .getByRole('img', { name: 'Processed', exact: true })
    .getAttribute('src');
  await steps.getByRole('button', { name: /Upload a file/ }).click();
  await expect(page.getByRole('button', { name: 'Choose files', exact: true })).toBeVisible();
  await expect(result).toBeVisible();
  await expect(steps.getByRole('button', { name: /Choose & edit/ })).toBeEnabled();
  await expect(steps.getByRole('button', { name: /Download/ })).toBeEnabled();
  await steps.getByRole('button', { name: /Choose & edit/ }).click();
  await expect(page.getByRole('complementary', { name: 'Editing settings' })).toBeFocused();
  await expect(page.getByLabel('Output format')).toHaveValue('png');
  await steps.getByRole('button', { name: /Download/ }).click();
  await expect(result).toBeFocused();
  expect(
    await result.getByRole('img', { name: 'Processed', exact: true }).getAttribute('src'),
  ).toBe(resultUrl);
  const output = await download(page);
  expect(output.name).toBe('photo-converted.png');
  expect(output.bytes.byteLength).toBeGreaterThan(0);
});

test('video stepper returns to upload and settings with the same video', async ({ page }) => {
  await page.goto('/video/remove-audio');
  await upload(page, 'h264-aac.mp4');
  await expect(page.getByTestId('process')).toBeEnabled();
  const steps = page.getByRole('list', { name: 'Your progress' });
  await steps.getByRole('button', { name: /Upload a file/ }).click();
  await expect(page.getByTestId('upload-zone')).toBeVisible();
  await steps.getByRole('button', { name: /Choose & edit/ }).click();
  await expect(page.getByRole('complementary', { name: 'Editing settings' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'h264-aac.mp4' })).toBeVisible();
  await expect(page.getByTestId('process')).toBeEnabled();
});
