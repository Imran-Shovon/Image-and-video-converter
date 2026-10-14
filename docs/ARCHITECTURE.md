# Architecture

Source spec: `media-toolkit-prompt-v2.md`. This document records the key decisions (spec §1.2) and how the system is built.

## 0. Key decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Framework | **Vite + React 19 + TypeScript (strict) SPA**, React Router 7, lazy route chunks. | No server rendering or API routes needed for a client-only release; simplest cross-origin-isolation and worker setup. |
| 2 | MVP scope | **Client-side only.** Server processing (Phase 5) is not built; `VITE_ENABLE_SERVER_PROCESSING=false`. | Privacy is the main benefit; no infrastructure to run. Every tool page says "Processed in your browser". |
| 3 | Hosting | **Static hosting with per-route headers and files over 30 MB** (Netlify config included). | ffmpeg-core.wasm is ~32 MB (Cloudflare Pages' 25 MiB file limit rules it out); COOP/COEP needed. |
| 4 | Size units | **Decimal** (1 MB = 1,000,000 bytes), labelled MB/KB everywhere. | Matches macOS/iOS/Android and common web tools. |
| 5 | Animated images | First frame only in image tools, with a notice before processing; GIF animation can be kept via Video → Convert. | Canvas reads one frame; full animation support is planned. |
| 6 | VP9 / H.265 encoding | VP9 via **WebCodecs only**; H.265 encoding **not offered**. | The ffmpeg.wasm 0.12.10 VP9 encoder crashes and x265 hangs (verified in Chromium). |
| 7 | ffmpeg.wasm threading | **Single-threaded core by default**, multithreaded opt-in. | The multithreaded 0.12.10 core hung/crashed on most real jobs in testing. |
| 8 | Background removal | **BiRefNet-lite (MIT)** run with **onnxruntime-web on WebGPU** in a dedicated worker; model self-hosted and patched at build time. | Chosen by the owner over RMBG-1.4 (non-commercial) and @imgly/background-removal (AGPL). It needs WebGPU: on the WASM CPU backend the 1024×1024 model exceeds the 4 GB WebAssembly memory limit. |
| 9 | Licensing | Flagged to the owner (GPL ffmpeg core, H.264/AAC patents) in THIRD_PARTY_LICENSES.md. | Spec §5: don't decide silently. |

## 1. Layers

```
UI (React)                features/*, components/*, pages/*
  │  tool pages build typed jobs from settings; never touch engines directly
  ▼
State hooks               useImageQueue, useVideoQueue  (validation → probe → run → verify, per-file status,
  │                       cancellation, retry, object-URL lifecycle)
  ▼
Engines                   imageEngine (worker pool)      videoEngine (WebCodecs → ffmpeg.wasm fallback)
  │                       lib/image-processing            lib/video-processing
  ▼
Shared media core         lib/media: capability matrix, magic-byte detection, header parsing, validation,
                          limits, routing, errors, filenames, sizes
```

Engine interface: `process(input, operations[], options, { onProgress, signal }) → verified output`. Swapping engines needs no UI change.

## 2. Capability matrix

`src/lib/media/capabilities.ts` is the single source of truth. Format pickers, the homepage format list and FAQ, the `/formats` page and `docs/SUPPORTED_FORMATS.md` (`npm run docs:formats`) are generated from it. Only `tested` and `browser-dependent` entries are offered. Runtime checks (for example, WebCodecs VP9 encoder availability) further narrow what a given browser sees.

## 3. Image pipeline (worker)

`decode → orient → crop/rotate/flip → resize → flatten alpha (JPEG/BMP) → encode → verify`

- **Decode:** `createImageBitmap` in a module worker. Falls back to jSquash WASM decoders (AVIF, WebP, JPEG, PNG) when the browser can't decode.
- **EXIF orientation:** a runtime probe (a tagged 2×1 JPEG) checks whether the browser applies it; if not, it is applied manually.
- **Transforms:** OffscreenCanvas. Right-angle rotations use exact transforms; fine angles fill corners with the chosen background.
- **Resize:** jSquash Lanczos3 (premultiplied, linear RGB).
- **Encoders:** MozJPEG, libwebp, libavif, OxiPNG (lossless), gifenc quantizer + OxiPNG (palette PNG), gifenc (GIF), a custom 24-bit BMP encoder. The browser's `canvas.toBlob` is never used for output, so a silent PNG fallback can't happen.
- **Target size:** binary search over quality (≤8 encodes), then optional downscaling rounds. Reports the closest result honestly if the target can't be met.
- **Verify:** magic bytes, decode, exact dimensions. Otherwise `VALIDATION_FAILED`.
- **Concurrency:** a worker pool (3 desktop / 1 mobile). Cancel terminates the worker; idle workers are terminated after 60 s.

## 4. Video pipeline

1. **Probe:** Mediabunny first (no 32 MB download). ffmpeg.wasm `-i` banner parsing (`probe-parse.ts`) for formats Mediabunny can't read (AVI, GIF, odd files).
2. **Route:** `routing.ts` checks size, duration and resolution limits and device memory, and returns warnings or a `MediaError`.
3. **Preview:** a detached `<video>` playability test. If the browser can't play the source, a 480 px H.264 proxy is generated for the crop/trim/thumbnail/GIF tools.
4. **Engine choice:** for re-encode jobs with "Automatic", WebCodecs via Mediabunny is used when it can decode the source and encode the target (MP4 H.264, WebM VP9). Otherwise ffmpeg.wasm.
5. **ffmpeg.wasm:** self-hosted cores, downloaded with progress into blob URLs (cached for reloads). Single-threaded core by default; the multithreaded core is opt-in (`VITE_FFMPEG_MULTITHREAD=true`) because the 0.12.10 build hung on most jobs, and a mid-job crash on it triggers one single-threaded retry. A generation counter ensures a cancelled job (or a load finishing after cancel) can never keep using a fresh engine instance. Input mounted with WORKERFS (no copy into MEMFS). One job at a time.
6. **Arguments:** pure builders in `args.ts`, unit-tested and executed against native FFmpeg in the test suite. A single pass does trim → crop → rotate/flip → scale → fps (no generation loss). Even dimensions are enforced for yuv420p. MP4/MOV get `+faststart`.
   - **Stream policy:** first video and first audio track kept; subtitles, data, chapters and metadata dropped.
   - **VFR:** timestamps passed through unless a fixed fps is chosen.
7. **Progress:** FFmpeg `time=` ÷ expected output duration, weighted per pass (two-pass). WebCodecs uses Mediabunny's progress. Indeterminate when duration is unknown.
8. **Verify:** magic bytes, re-probe of the output, expected streams, dimensions and duration within tolerance (±0.15 s re-encode; looser for keyframe-snapped fast trim).
9. **Cancel / timeout:** `ffmpeg.terminate()` (or `conversion.cancel()`), then the engine reloads lazily from the cached blob URLs. Default job timeout is 30 min.

## 5. Background removal

`segment (worker, WebGPU) → mask op in the image pipeline → encode → verify`

- **Model:** BiRefNet-lite at a pinned Hugging Face revision; fp16 (115 MB), or fp32 (224 MB) when the GPU lacks `shader-f16`. `scripts/fetch-models.mjs` downloads it (SHA-256 checked) and patches the graph with `scripts/onnx-split-wide-nodes.mjs`:
  - Concat nodes with up to 1,024 inputs and Split nodes with up to 32 outputs become trees of nodes with at most 7 inputs/outputs. WebGPU allows 8 storage buffers per shader stage by default, and onnxruntime compiles one buffer per input/output.
  - `Sum` becomes a chain of `Add` (there is no WebGPU kernel for it).
  The rewrite is exact; `tests/unit/onnx-split.test.ts` compares outputs before and after with onnxruntime.
- **Session:** `enableInt64` is set on the WebGPU EP; otherwise the model's int64 index arithmetic falls back to the CPU and runs out of WASM memory. One WASM thread (the CPU part is tiny).
- **Download:** real progress, cached in Cache Storage (older versions deleted). A WebGPU device is created once up front, so systems that expose an adapter but can't create a device get a clear "needs WebGPU" message.
- **Inference:** the 1600 px oriented preview is scaled to 1024×1024 and normalised (ImageNet mean/std); the sigmoid of the output becomes a 1024² alpha mask. Under 0.2 % foreground is reported as "no clear subject" instead of returning an empty image.
- **Compositing:** the `mask` image operation stretches the mask over the full-resolution image (`destination-in`) and optionally fills a solid colour behind it. The normal encoders and output verification then run.
- **Lifecycle:** one job at a time; cancel terminates the worker; the worker (and its GPU memory) is released after 3 minutes idle.

## 6. Errors

`src/lib/media/errors.ts` defines the taxonomy (`UNSUPPORTED_FORMAT`, `CORRUPTED_FILE`, `TOO_LARGE`, `TOO_MANY_PIXELS`, `TOO_LONG`, `NO_AUDIO_TRACK`, `CODEC_UNAVAILABLE`, `OUT_OF_MEMORY`, `TIMEOUT`, `CANCELLED`, `ENCODER_FAILED`, `VALIDATION_FAILED`, …). Each code has a title, message and suggested next step. Worker errors cross the boundary as `{ code, detail }`. Raw engine output goes to the console only. A failed batch item never stops the rest, and "Retry failed" re-runs only the failures.

## 7. UI

- **Design tokens:** CSS variables mapped to Tailwind v4 theme colours. Light theme by default; dark/system toggle persisted, applied before paint by `public/theme-init.js`, which keeps the CSP free of inline scripts.
- **Shared components:** UploadZone (drag/drop, picker, paste), ProgressBar (real progress, `aria-live` in 10 % steps), ErrorAlert, ResultCard (sizes, change %, download/share, keep original, continue with…), CompareSlider (range-input divider, 100 % zoom), Cropper (pointer, pinch, keyboard; source-pixel coordinates), TrimBar (two-thumb Radix slider, frame stepping, timecode fields).
- **Tool chaining:** a Zustand hand-off store passes the result `File` to the next tool in memory.
- **Settings:** per tool in `localStorage`, validated against defaults on load.

## 8. Not built in this release

- Server processing (Phase 5): queue, uploads, worker containers, consent flow. The routing module and error codes are ready for it.
- HEIC decoding in browsers other than Safari (no WASM HEIF decoder bundled).
- Animated GIF/WebP/APNG preservation inside the image tools.
- "Keep metadata".
- PWA/offline mode.
- SEO pre-rendering of tool pages.
