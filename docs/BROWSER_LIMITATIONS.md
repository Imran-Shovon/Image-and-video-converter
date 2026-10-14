# Browser limitations

Targets: latest two versions of Chrome, Edge and Firefox; Safari / iOS Safari 16.4+; Chrome for Android. Features are detected at runtime (`src/lib/media/features.ts`); there is no user-agent sniffing. The in-app page `/browser-support` shows the live result for the current browser.

## Video

- **Speed.** ffmpeg.wasm runs several times slower than native FFmpeg. H.264 (`libx264`) is the fastest encoder. Where the browser's WebCodecs encoder supports a job (MP4 H.264 or WebM VP9), it is used automatically and is much faster.
- **Memory.** WebAssembly memory tops out around 2 GB, and much less on phones. Long or 4K videos can fail with `OUT_OF_MEMORY`; the default limits (500 MB / 10 min / 4K on desktop, 200 MB / 3 min / 1080p on mobile) keep most jobs within budget.
- **Single-threaded FFmpeg by default.** In testing, the multithreaded ffmpeg.wasm 0.12.10 core hung or crashed on most jobs (H.264 + AAC, VP8, thumbnails, rotation), while the single-threaded core finished the same jobs in 1–2 s. Multithreading is opt-in (`VITE_FFMPEG_MULTITHREAD=true`, needs cross-origin isolation); if it crashes mid-job, the job is retried once single-threaded and later jobs stay single-threaded. Cross-origin isolation is still enabled because the AVIF and OxiPNG WASM encoders use threads.
- **VP9 encoding** is done only with WebCodecs. The VP9 encoder in this ffmpeg.wasm build (0.12.10) crashes ("memory access out of bounds") or hangs, so it is not used. Where WebCodecs has no VP9 encoder, the option is disabled.
- **H.265/HEVC encoding** is not offered: the x265 encoder in ffmpeg.wasm does not finish. HEVC **input** works.
- **AV1.** No AV1 encoder in either engine. The ffmpeg.wasm build has no AV1 decoder either, so AV1 input works only where WebCodecs/Mediabunny can decode it.
- **Preview of unplayable formats.** Chrome/Firefox cannot play MKV, AVI, HEVC (without hardware support) or ProRes. The crop, trim, thumbnail and GIF tools then generate a low-resolution preview with ffmpeg.wasm; processing still uses the original file.
- **Two-pass encoding** (target size) uses ffmpeg.wasm. For VP9, WebCodecs does single-pass bitrate control.
- **Fast trim** copies streams, so cut points snap to keyframes. Use precise mode for frame accuracy.

## Images

- **HEIC/TIFF/ICO** decode only where the browser supports them natively (Safari for HEIC/TIFF). Elsewhere the user gets `CODEC_UNAVAILABLE` with a suggestion.
- **AVIF input** falls back to the libavif WASM decoder when the browser can't decode AVIF.
- **Animated GIF/WebP/APNG** are processed as their first frame in the image tools, with a notice. To keep GIF animation, use Video → Convert (GIF → MP4/WebM).
- **Metadata** (EXIF, GPS, ICC) is always stripped on re-encode, and colours are converted to sRGB. "Keep metadata" is not available client-side.
- **iOS canvas limit.** iOS Safari limits canvases to about 16.7 MP, which is why the mobile pixel limit is 16.7 MP.
- **EXIF orientation** is applied by the browser where supported; this is detected at runtime with a tagged 2×1 JPEG, and applied manually otherwise.

## Background removal

- **Needs WebGPU** (Chrome/Edge 113+ on Windows, macOS and ChromeOS; Chrome on Android 12+ with a supported GPU; Safari 26+; Firefox 141+ on Windows). Where WebGPU is missing, or an adapter exists but no device can be created, the tool says so and stays disabled. There is no CPU fallback: on the WASM backend the model exceeds the 4 GB WebAssembly memory limit.
- **One-time download** of 115 MB (224 MB on GPUs without 16-bit float shaders), kept in Cache Storage. Private windows or cleared site data download it again.
- **Speed** depends on the GPU: about 6 s per image on an Intel integrated GPU after the first run (the first run also compiles shaders, about 15–20 s).
- **Resolution:** the model sees the image at 1024×1024 and the mask is scaled up to the full image, so very fine detail (single hairs) on large photos is softer than in the original.
- **Testing:** Playwright's bundled Chromium on Windows cannot create a WebGPU device, so the end-to-end test runs in the system Edge (`edge-webgpu` project). CI runners without a GPU skip it.

## Downloads

- **iOS Safari** opens blob downloads in a preview. Use **Share → Save to Files/Photos** (a Share button appears where the Web Share API supports files).
- **ZIP downloads** are built with a streaming ZIP writer, but the final blob is held in memory. Very large batches are blocked by the ZIP size limit (1 GB desktop, 300 MB mobile); download files individually instead.

## Test coverage by browser

End-to-end tests run in Playwright's Chromium, Firefox and WebKit builds plus a Pixel 7 viewport. Playwright's WebKit on Windows is not identical to Safari on macOS/iOS. In particular, Playwright's WebKit on Windows has no OffscreenCanvas, so image-processing tests are skipped there (the app shows a clear "OffscreenCanvas is missing" message, which is tested); run the suite on macOS to cover Safari image processing. Background removal is tested with real WebGPU in the system Edge (`edge-webgpu` project). Downloads on real iOS/Android devices must be checked manually before release.
