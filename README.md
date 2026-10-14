# Media Toolkit

Convert, compress, crop, resize and trim images and videos **entirely in the browser**. Files never leave the user's device.

- **Image tools:** convert (JPG, PNG, WebP, AVIF, GIF, BMP), compress (presets, quality, target size, PNG palette), crop/rotate/flip, resize (Lanczos), **remove background** (an AI model running on the device via WebGPU), batch processing with ZIP download.
- **Video tools:** convert (MP4 H.264, WebM VP8/VP9, MOV, container-only remux), compress (CRF presets or target size with two-pass), trim (fast keyframe or frame-accurate), crop, resize/rotate/flip, extract audio (MP3, M4A, WAV, Opus), remove audio, thumbnail, video-to-GIF.
- Every output is **verified** (format magic bytes, decode, dimensions, duration, streams) before it is offered for download. Progress is real; nothing is simulated.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/SUPPORTED_FORMATS.md](docs/SUPPORTED_FORMATS.md), [docs/BROWSER_LIMITATIONS.md](docs/BROWSER_LIMITATIONS.md), [docs/SECURITY.md](docs/SECURITY.md) and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Requirements

- Node.js 20.19+ (developed on Node 26) and npm 10+.
- No system FFmpeg is needed to run the app: the browser uses ffmpeg.wasm (self-hosted from `public/ffmpeg`, copied from `node_modules` on install/build).
- `npm run dev` / `npm run build` also download the background-removal model once (about 340 MB from Hugging Face, pinned revision, SHA-256 checked) into `.cache/models`, patch it for WebGPU and write it to `public/models`. Set `SKIP_MODELS=1` to skip; the Remove background tool then reports that the model is unavailable.
- Test fixtures are generated with the `ffmpeg-static` and `sharp` dev dependencies (npm 11 asks you to approve `ffmpeg-static`'s install script; the approval is recorded in `package.json` → `allowScripts`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm install` | Installs dependencies and copies the ffmpeg.wasm cores to `public/ffmpeg`. |
| `npm run dev` | Dev server on http://localhost:5173 with cross-origin isolation headers. |
| `npm run build` | Type-checks and builds to `dist/`. |
| `npm run preview` | Serves the production build (with the same headers as production). |
| `npm run lint` / `npm run typecheck` | ESLint (incl. React Compiler rules) / TypeScript strict. |
| `npm test` | Unit tests (Vitest). Includes running the FFmpeg argument builders against native FFmpeg. |
| `npm run fixtures` | Generates test media into `tests/fixtures/generated` (git-ignored). |
| `npm run test:e2e` | Playwright end-to-end tests in Chromium, Firefox, WebKit and a mobile viewport, plus background removal in the system Edge with real WebGPU (`edge-webgpu`, on by default on Windows; set `PW_WEBGPU_CHANNEL=chrome` elsewhere). Run `npm run build` and `npm run fixtures` first. |
| `npm run docs:formats` | Regenerates `docs/SUPPORTED_FORMATS.md` from the capability matrix. |
| `npm run models` | Downloads and patches the background-removal model (runs automatically before `dev` and `build`). |

## Environment variables

All optional; see [.env.example](.env.example). Limits default to spec §9 and can be overridden per device profile, e.g. `VITE_LIMIT_DESKTOP_VIDEO_MB=800`. `VITE_FFMPEG_MULTITHREAD=true` opts in to the multithreaded ffmpeg core (off by default; see docs/BROWSER_LIMITATIONS.md). `VITE_ENABLE_SERVER_PROCESSING` must stay `false`: server processing is not part of this release.

## Limits (defaults)

| Limit | Desktop | Mobile |
| --- | --- | --- |
| Image file size | 50 MB | 25 MB |
| Image pixels | 100 MP | 16.7 MP |
| Video file size | 500 MB | 200 MB |
| Video duration | 10 min | 3 min |
| Video resolution (longest edge) | 3840 px | 1920 px |
| GIF export | 30 s | 15 s |
| Batch size | 50 files | 20 files |
| Concurrent jobs | 1 video / 3 images | 1 |

Sizes are decimal (1 MB = 1,000,000 bytes).

## Deployment

The app is a static site. It needs:

1. **Cross-origin isolation headers** on every page (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) so threaded WASM codecs (AVIF, OxiPNG and the optional multithreaded ffmpeg core) can use `SharedArrayBuffer`. They are applied site-wide because client-side navigation would otherwise reach video pages without them. All assets are self-hosted, so nothing third-party breaks.
2. **Static files over 30 MB** (`ffmpeg-core.wasm` is ~32 MB; the background-removal models are 115 MB and 224 MB). Cloudflare Pages (25 MiB per file) is therefore not suitable.
3. **SPA fallback** to `index.html`.

`netlify.toml` configures all of this for Netlify, including CSP and long-term caching of `/ffmpeg/*` and `/assets/*`. For other hosts, replicate the headers in that file.

## Project structure

```
src/
  components/      shared UI (upload, progress, cropper, compare slider, result card, layout)
  features/        image and video tool pages + their state hooks
  lib/media/       capability matrix, detection, validation, limits, errors, routing, filenames
  lib/image-processing/  engine interface, worker pipeline, WASM encoders, geometry, target-size search
  lib/video-processing/  ffmpeg.wasm + WebCodecs engines, pure FFmpeg argument builders, probe parser, verification
  lib/background-removal/ model config + client for the WebGPU segmentation worker
  workers/         image worker, background-removal worker
  pages/           home, formats, browser support, privacy, terms, licenses
scripts/           ffmpeg core copy, model fetch + ONNX patch, fixture generator, formats doc generator
tests/unit         Vitest
tests/e2e          Playwright
```
