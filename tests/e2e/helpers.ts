import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test, type Download, type Page } from '@playwright/test';
import ffmpegPath from 'ffmpeg-static';

export const fixture = (name: string) => join(process.cwd(), 'tests', 'fixtures', 'generated', name);

/**
 * Image processing needs OffscreenCanvas. Playwright's WebKit build on Windows has none (Safari 16.4+ does),
 * so image-processing tests are skipped there; app.spec checks the error message instead.
 */
export async function skipWithoutOffscreenCanvas(page: Page) {
  const available = await page.evaluate(() => typeof OffscreenCanvas !== 'undefined');
  test.skip(!available, 'No OffscreenCanvas in this browser build (Playwright WebKit on Windows)');
}

export async function upload(page: Page, ...names: string[]) {
  await page.getByTestId('file-input').first().setInputFiles(names.map(fixture));
}

/** Clicks the main action and waits for the result card. */
export async function runTool(page: Page, timeout = 120_000) {
  await page.getByTestId('process').click();
  await expect(page.getByTestId('result-card')).toBeVisible({ timeout });
}

export async function download(page: Page, testId = 'download'): Promise<{ download: Download; bytes: Buffer; name: string }> {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()]);
  const path = await dl.path();
  return { download: dl, bytes: readFileSync(path!), name: dl.suggestedFilename() };
}

const run = promisify(execFile);

/** Reads the FFmpeg banner of a downloaded file with native FFmpeg for independent verification. */
export async function probeFile(path: string): Promise<string> {
  try {
    await run(ffmpegPath as unknown as string, ['-hide_banner', '-i', path]);
    return '';
  } catch (error) {
    return (error as { stderr?: string }).stderr ?? '';
  }
}

export async function probeDownload(dl: Download): Promise<string> {
  return probeFile((await dl.path())!);
}

export function durationOf(banner: string): number | null {
  const m = /Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(banner);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
}
