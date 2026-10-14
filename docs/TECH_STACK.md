# Tech Stack

What the project uses, what each piece does, and when it gets added.

> **Status:** Implemented. Decisions are recorded in [ARCHITECTURE.md](ARCHITECTURE.md). Deviations from the original proposal are noted inline.

**Guiding rule:** files are processed **in the user's browser** by default, so nothing is uploaded. A server is optional and comes later (Phase 5).

---

## 1. Application foundation

| Technology | What it does in this project | Phase |
|---|---|---|
| **React 19** | Builds the user interface: upload area, tool controls, previews, download buttons. | 1 |
| **TypeScript (strict)** | Adds type checking to catch mistakes before the code runs. Required by the spec, with no `any` in processing code. | 1 |
| **Vite** | Development server and production build. Fast reloads, small bundles, good Web Worker and WASM support. | 1 |
| **React Router** | One page per tool (`/image/compress`, `/video/trim`, …). Tool code loads only when the page is opened. | 1 |
| **Zustand** | Small state store. Remembers each tool's last-used settings and the light/dark theme in the browser. | 1 |
| **Comlink** | Makes Web Workers easy to call, so heavy processing runs in the background and the page never freezes. | 1 |

## 2. Design and accessibility

| Technology | What it does | Phase |
|---|---|---|
| **Tailwind CSS v4** | Styling with shared color, spacing and typography tokens; light and dark themes. | 1 |
| **Radix UI** | Accessible dialogs, sliders, tabs and menus with keyboard support and focus handling. | 1 |
| **lucide-react** | Icons. | 1 |
| **Custom Cropper component** | Built in-house so it supports mouse, touch (drag and pinch) and keyboard (arrows move, Shift+arrows resize), and maps exactly to real image pixels. Used by both the image and video croppers. | 2 |

## 3. File handling

| Technology | What it does | Phase |
|---|---|---|
| **Built-in magic-byte detector** (`src/lib/media/detect.ts`) | Reads the first bytes of a file to find its real type, instead of trusting the file extension. Replaced the planned `file-type` package: smaller, browser-native and unit-tested. | 1 |
| **Built-in header parser** (`src/lib/media/image-header.ts`) | Reads dimensions, animation and EXIF orientation from file headers. Replaced the planned `exifr` package. | 2 |
| **client-zip** | Builds the "Download all as ZIP" file piece by piece, so big batches don't run out of memory. | 4 |

## 4. Image processing

All of this runs in the browser inside a Web Worker.

| Technology | What it does | Phase |
|---|---|---|
| **Canvas / OffscreenCanvas** | The browser's built-in drawing engine. Decodes images, crops, rotates, flips, and encodes JPG/PNG/WebP where the browser supports it. | 2 |
| **jSquash** (WASM codecs) | Higher-quality or missing encoders: **MozJPEG** (smaller JPGs), **libwebp**, **libavif** (most browsers can't make AVIF), **OxiPNG** (lossless PNG shrinking), and **resize** (sharp Lanczos resizing). | 2 |
| **gifenc quantizer** | Lossy PNG compression by reducing colours. Replaced libimagequant, whose licence is GPL-3.0. | 2 |
| **gifenc / gifuct-js** | Create and read GIF files. | 2 |
| **Custom BMP encoder** | BMP is simple, so a small encoder is written in the project instead of adding a library. | 2 |
| **libheif-js** *(optional)* | Opens iPhone HEIC photos, which most browsers can't read. | 2+ |
| **onnxruntime-web (WebGPU) + BiRefNet-lite** | Added after the plan: the Remove background tool. An MIT-licensed AI model runs on the user's GPU in a worker; the model is self-hosted and downloaded once. | Added |

**Safety check:** some browsers quietly return a PNG when asked for a format they can't make. After every conversion the app checks the actual file type and never delivers a different format than the one chosen.

## 5. Video processing

Also runs in the browser.

| Technology | What it does | Phase |
|---|---|---|
| **ffmpeg.wasm 0.12** | The FFmpeg video toolkit compiled to run in the browser. Handles conversion, compression, cropping, trimming, audio extraction, thumbnails and GIF creation. About 31 MB, served from our own site and downloaded only when a video tool is opened. | 3 |
| **WebCodecs + Mediabunny** | Faster, hardware-accelerated encoding through the browser's own video encoders, where supported. Falls back to ffmpeg.wasm otherwise. | 3 |
| **HTML5 `<video>`** | Shows previews. For formats the browser can't play (MKV, HEVC), the app creates a small preview copy with FFmpeg. | 3 |

**Limits:** browser video processing is slower than desktop software and limited by device memory. That's why the spec sets file-size and duration limits (500 MB / 10 min on desktop, lower on phones).

## 6. Testing and quality

| Technology | What it does | Phase |
|---|---|---|
| **Vitest** | Unit tests for core logic: FFmpeg command building, size calculations, file validation, crop maths. | 1 |
| **Playwright** | End-to-end tests that use the app in real Chrome, Firefox and Safari (WebKit) engines, including phone screen sizes. | 1 |
| **axe-core** | Automated accessibility checks. | 1 |
| **ESLint + Prettier** | Code-quality rules and consistent formatting. | 1 |
| **GitHub Actions** | Runs lint, type-check, tests and build on every pull request. | 1 |
| **Fixture script** (FFmpeg + Sharp) | Generates test images and videos (transparent, rotated, corrupted, no audio, …) instead of storing large files in the repo. Needs FFmpeg installed locally (`winget install ffmpeg` on Windows). | 1 |

## 7. Server (optional, Phase 5)

Only added if server processing is turned on (`ENABLE_SERVER_PROCESSING=true`), for files too big for the browser. Users are always asked before anything is uploaded.

| Technology | What it does |
|---|---|
| **Node.js + Fastify** | API for upload, job status, cancel and download. |
| **BullMQ + Redis** | Job queue so encoding runs in the background, one job at a time per worker. |
| **Native FFmpeg + Sharp** | Fast server-side video and image processing. |
| **Docker** | Runs the worker in a locked-down container (no network, limited CPU and memory, non-root user). |
| **tus / pre-signed URLs** | Resumable uploads for large files. |
| **MinIO / S3** | Temporary file storage, deleted automatically after about an hour. |

## 8. Hosting

| Option | Notes |
|---|---|
| **Netlify** or **Vercel** (static) | Recommended. Both allow the 31 MB FFmpeg file and per-page security headers. |
| ~~Cloudflare Pages~~ | Not suitable: its 25 MiB per-file limit blocks the FFmpeg core. |
| Fly.io / Render / Railway | Only needed for the Phase 5 server worker. |

Video pages need two special headers (`Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`) so ffmpeg.wasm can use multiple CPU threads.

---

## 9. What will be built, step by step

1. **Phase 1 – Foundation:** set up the project, tooling and CI; build the design system, homepage and upload area; detect the real file type; reject bad files with clear messages; check which formats this browser supports.
2. **Phase 2 – Image tools:** convert, compress (including "target file size"), crop, resize, rotate and flip images, with before/after preview and download.
3. **Phase 3 – Video tools:** load ffmpeg.wasm on demand; convert, compress, crop, trim, resize and rotate videos; extract or remove audio; make thumbnails and GIFs; show real progress with a Cancel button.
4. **Phase 4 – Batch and polish:** process many files at once, download all as ZIP, retry failed files, recover from crashes, and pass a result straight to another tool.
5. **Phase 5 – Server (optional):** secure upload-and-process backend for files too big for the browser.
6. **Phase 6 – Launch readiness:** full test coverage, performance and accessibility audits, security headers, and final documentation.

Each phase ends with a passing build and tests and a working demo before the next one starts.

## 10. Alternative considered

**Next.js** instead of Vite: better for search engines and has built-in server routes. It isn't needed for a browser-only first release, but is a reasonable switch if SEO becomes a priority.
