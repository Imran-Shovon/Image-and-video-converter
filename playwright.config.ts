import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build served by `vite preview`, which sends the same
// cross-origin isolation headers as production. Fixtures come from `npm run fixtures`.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
    // Real WebGPU for background removal: the system Edge (or Chrome via PW_WEBGPU_CHANNEL) with a GPU.
    // Enabled by default on Windows, where Edge is always installed; set PW_WEBGPU_CHANNEL elsewhere.
    ...(process.env.PW_WEBGPU_CHANNEL || process.platform === 'win32'
      ? [{ name: 'edge-webgpu', use: { ...devices['Desktop Edge'], channel: process.env.PW_WEBGPU_CHANNEL ?? 'msedge' }, testMatch: /background\.spec\.ts/ }]
      : []),
  ],
});
