/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Cross-origin isolation is required for SharedArrayBuffer (multithreaded ffmpeg.wasm).
// It is applied site-wide because client-side navigation would otherwise land on
// video pages without the headers. All assets are self-hosted, so nothing breaks.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// `server.headers`/`preview.headers` are not sent on 304 responses. WebKit then refreshes the cached worker
// script without COEP and refuses to start it, so the headers are also set by a middleware on every response.
const isolationEverywhere: Plugin = {
  name: 'isolation-headers-on-every-response',
  configureServer: (server) => void server.middlewares.use(setIsolationHeaders),
  configurePreviewServer: (server) => void server.middlewares.use(setIsolationHeaders),
};

function setIsolationHeaders(_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) {
  for (const [name, value] of Object.entries(isolationHeaders)) res.setHeader(name, value);
  next();
}

export default defineConfig({
  plugins: [react(), tailwindcss(), isolationEverywhere],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    headers: isolationHeaders,
    // Test artefacts must not trigger reloads while the app is running.
    watch: {
      ignored: ['**/test-results/**', '**/playwright-report/**', '**/tests/fixtures/**', '**/.cache/**', '**/public/ffmpeg/**', '**/public/models/**'],
    },
  },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  optimizeDeps: {
    // These packages resolve their .wasm files relative to import.meta.url; pre-bundling breaks that.
    exclude: [
      '@ffmpeg/ffmpeg',
      '@ffmpeg/util',
      '@jsquash/avif',
      '@jsquash/jpeg',
      '@jsquash/oxipng',
      '@jsquash/png',
      '@jsquash/resize',
      '@jsquash/webp',
    ],
  },
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
