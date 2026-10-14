# Security

## Threat model (this release)

All processing happens in the user's browser. There is no upload endpoint, no server-side processing and no storage of user media, so the main risks are malicious **input files** attacking the decoders and the page, and **supply chain** risks from the bundled engines.

## Input handling

- **Content sniffing, not extensions.** Files are identified by magic bytes (`src/lib/media/detect.ts`). The extension and browser-supplied MIME type are ignored; mismatches are shown to the user.
- **Rejected inputs.** HLS playlists (`#EXTM3U`) and `ffconcat` lists are recognised and rejected, because they can make FFmpeg read other files. SVG is rejected because it can contain scripts and cannot be rasterised safely in a worker. Uploaded content is never injected into the DOM.
- **Decompression bombs.** Image dimensions are read from the header (`image-header.ts`) and checked against the pixel limit **before** any decoding.
- **Truncated files.** JPEG/PNG/GIF files without an end-of-image marker are rejected as corrupted (browsers would otherwise decode them silently).
- **Limits.** File size, pixel count, duration, resolution, GIF length and batch size are enforced (`limits.ts`, `routing.ts`).
- **Isolation.** Decoding and encoding run in Web Workers / the ffmpeg.wasm worker inside the WebAssembly sandbox. A crash or out-of-memory error terminates that worker; the page stays usable and the user keeps their file and settings.

## FFmpeg invocation

- Arguments are built by pure functions (`src/lib/video-processing/args.ts`) as **arrays**; there is no shell.
- Every user setting is mapped to an enum or a clamped number. Raw strings from the UI never reach FFmpeg.
- Inputs are mounted read-only through WORKERFS at a fixed path with a sanitised name (`/input/input.<ext>`); outputs go to `/work`, which is cleared after each job.

## Output verification

A result is offered only after it passes verification: non-empty, correct magic bytes, decodable, expected dimensions, expected streams and duration within tolerance. Failures surface as `VALIDATION_FAILED`.

## Headers

Configured in `netlify.toml` (replicate on other hosts):

- `Content-Security-Policy`: `default-src 'self'`; scripts from self and `blob:` (ffmpeg.wasm loads its core from blob URLs) plus `'wasm-unsafe-eval'` (also needed by onnxruntime-web); no inline scripts (the theme bootstrap is an external file); `object-src 'none'`; `frame-ancestors 'none'`.
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera, microphone and geolocation.

## Privacy

- No analytics, cookies or third-party requests. Fonts, engines and codecs are self-hosted.
- Only tool settings and the theme are stored, in `localStorage`. The background-removal model (fetched from the same origin) is kept in Cache Storage; older model versions are deleted when a new one is downloaded.
- Errors shown to users are mapped to friendly messages; raw engine output is logged to the developer console only.
- Image metadata (EXIF, GPS, ICC) is stripped on re-encode; video metadata, chapters and subtitles are dropped.

## Dependencies

Media parsers are a frequent source of CVEs. Keep `@ffmpeg/core`, `@ffmpeg/core-mt`, `mediabunny` and the `@jsquash/*` codecs up to date, and rebuild after updating (the cores are copied into `public/ffmpeg` at build time).

## If server processing is added later (spec §6.3)

It must not ship without: server-side validation (magic bytes + ffprobe/Sharp), `-protocol_whitelist file,pipe`, playlist/concat rejection, demuxer allow-lists, non-root read-only containers without network access, cgroup limits and timeouts, random UUID storage paths, signed short-lived download URLs, rate limiting, explicit user consent before upload, and a cleanup sweeper.
