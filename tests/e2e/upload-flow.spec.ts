import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { upload } from './helpers';

test('starts with upload and reveals only image actions after selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Convert image|Convert video/ })).toHaveCount(0);
  await upload(page, 'photo.jpg');
  await expect(page.getByRole('heading', { name: 'What would you like to do?' })).toBeFocused();
  await expect(page.getByRole('img', { name: 'Preview of photo.jpg' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Convert image/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Convert video|Trim video/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Compress image/ }).click();
  await expect(page.getByRole('heading', { name: 'photo.jpg' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Preview of photo.jpg' })).toBeVisible();
  await expect(page.getByTestId('process')).toBeEnabled();
  await expect(page.getByRole('alert').filter({ hasText: 'Cancelled' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Back to workspace' }).click();
  await expect(page.getByRole('button', { name: /Resize image/ })).toBeVisible();
  await expect(page.getByText('photo.jpg', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose another file' }).click();
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Convert image/ })).toHaveCount(0);
});

test('reveals video actions and hands the video to its editor', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'h264-aac.mp4');
  await expect(page.getByRole('button', { name: /Trim video/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Extract audio/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Convert image/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Trim video/ }).click();
  await expect(page).toHaveURL(/\/video\/trim$/);
  await expect(page.getByRole('heading', { name: 'h264-aac.mp4' })).toBeVisible();
});

test('keeps upload available after invalid input', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'empty.png');
  await expect(page.getByRole('alert')).toContainText('Empty file');
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Convert image/ })).toHaveCount(0);
  await upload(page, 'photo.jpg');
  await expect(page.getByRole('button', { name: /Convert image/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('upload and action selection fit on a phone @mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose file', exact: true })).toBeInViewport();
  for (const loaded of [false, true]) {
    if (loaded) await upload(page, 'photo.jpg');
    if (loaded) await expect(page.getByRole('button', { name: /Convert image/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
  }
});

test('file selection is accessible in light and dark themes', async ({ page }) => {
  await page.goto('/');
  await upload(page, 'photo.jpg');
  await expect(page.getByRole('button', { name: /Convert image/ })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((violation) => `${theme}: ${violation.id}`)).toEqual([]);
  }
});
