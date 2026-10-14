# Supported formats

> Generated from `src/lib/media/capabilities.ts` by `npm run docs:formats`. Do not edit by hand.
> Only **Supported** and **Browser-dependent** entries are offered in the app.

## Image input

| Format | Decoder | Status | Notes |
| --- | --- | --- | --- |
| JPG | canvas | Supported (tested) | EXIF orientation applied before any transform. CMYK decodes where the browser supports it. |
| PNG | canvas | Supported (tested) | Animated PNG: first frame only. |
| WebP | canvas | Supported (tested) | Animated WebP: first frame only. |
| AVIF | canvas, wasm-codec | Supported (tested) | Falls back to the libavif WASM decoder when the browser cannot decode AVIF. |
| GIF | canvas | Supported (tested) | Animated GIF: first frame only in image tools; use Video → Convert to keep the animation. |
| BMP | canvas | Supported (tested) |  |
| HEIC | canvas | Browser-dependent | Decoded only by browsers with native HEIC support (Safari 17+). |
| TIFF | canvas | Browser-dependent | Decoded only by browsers with native TIFF support (Safari). |
| ICO | canvas | Browser-dependent |  |
| SVG | — | Not supported | Rejected: SVG can contain scripts, and workers cannot rasterize it safely. |

## Image output

| Format | Encoder | Lossy | Transparency | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| JPG | MozJPEG (jSquash) | Yes | No | Supported (tested) | Transparent areas are filled with a background colour you choose. |
| PNG | OxiPNG (jSquash) + gifenc quantizer | No | Yes | Supported (tested) | Lossless optimisation, or lossy palette reduction (2–256 colours). |
| WebP | libwebp (jSquash) | Yes | Yes | Supported (tested) |  |
| AVIF | libavif (jSquash) | Yes | Yes | Supported (tested) | Encoding is slow for large images. |
| GIF | gifenc | Yes | Yes | Supported (tested) | Limited to 256 colours; 1-bit transparency. |
| BMP | built-in 24-bit encoder | No | No | Supported (tested) | Uncompressed 24-bit. Transparent areas are filled with a background colour. |

## Video input

| Container | Status | Notes |
| --- | --- | --- |
| MP4 | Supported (tested) | H.264, H.265/HEVC, VP9 and AV1 video; AAC, MP3, Opus audio. |
| MOV | Supported (tested) | ProRes and HEVC may need a preview proxy in Chrome/Firefox. |
| WebM | Supported (tested) | VP8, VP9, AV1 with Opus/Vorbis audio. |
| MKV | Supported (tested) | Browsers cannot play MKV directly; a preview proxy is generated. |
| M4V | Supported (tested) |  |
| AVI | Experimental (not advertised) | Decoded by ffmpeg.wasm; a preview proxy is generated. |
| 3GP | Experimental (not advertised) |  |

## Video output

| Output | Engines | Status | Notes |
| --- | --- | --- | --- |
| MP4 (H.264 + AAC) | webcodecs, ffmpeg-wasm | Supported (tested) | yuv420p with +faststart for web playback. Plays everywhere. |
| WebM (VP9 + Opus) | webcodecs | Browser-dependent | Encoded with your browser’s WebCodecs VP9 encoder (Chrome, Edge, Firefox). The ffmpeg.wasm VP9 encoder crashes in this build, so it is not used. |
| WebM (VP8 + Vorbis) | ffmpeg-wasm | Supported (tested) |  |
| MOV (H.264 + AAC) | ffmpeg-wasm | Supported (tested) |  |
| MP4 (H.265/HEVC + AAC) | — | Not supported | The ffmpeg.wasm x265 encoder does not finish in the browser. HEVC input is supported. |
| Animated GIF | ffmpeg-wasm | Supported (tested) | Two-pass palette; for short clips only. |

## Audio output (Extract audio)

| Format | Codec | Status | Notes |
| --- | --- | --- | --- |
| MP3 | MP3 (LAME) | Supported (tested) |  |
| M4A (AAC) | AAC | Supported (tested) | Stream copy when the source audio is already AAC. |
| WAV | PCM 16-bit | Supported (tested) |  |
| Opus | Opus | Supported (tested) | Stream copy when the source audio is already Opus. |

## Operations

| Operation | Engines | Status | Notes |
| --- | --- | --- | --- |
| Convert image format | canvas, wasm-codec, custom | Supported (tested) |  |
| Compress image (presets, quality, target size) | wasm-codec | Supported (tested) |  |
| Crop, rotate and flip image | canvas | Supported (tested) |  |
| Resize image (Lanczos3) | wasm-codec | Supported (tested) |  |
| Remove background (AI, on device) | webgpu-ml, canvas, wasm-codec | Browser-dependent | BiRefNet-lite (MIT) via onnxruntime-web on WebGPU; one-time model download of about 115 MB (224 MB on GPUs without 16-bit float support). Not available without WebGPU. |
| Batch processing and ZIP download | canvas, wasm-codec | Supported (tested) |  |
| Keep EXIF/ICC metadata | — | Not supported | Client-side re-encoding always strips metadata; colours are converted to sRGB. |
| Preserve animation in image tools | — | Planned | Image tools process the first frame. Video → Convert keeps GIF animation. |
| Convert video (re-encode) | webcodecs, ffmpeg-wasm | Supported (tested) |  |
| Change container only (stream copy) | ffmpeg-wasm | Supported (tested) |  |
| Compress video (CRF presets, target size) | webcodecs, ffmpeg-wasm | Supported (tested) |  |
| Crop video | webcodecs, ffmpeg-wasm | Supported (tested) |  |
| Trim video (fast and precise) | ffmpeg-wasm | Supported (tested) |  |
| Resize, rotate and flip video | webcodecs, ffmpeg-wasm | Supported (tested) |  |
| Extract audio | ffmpeg-wasm | Supported (tested) |  |
| Remove audio | ffmpeg-wasm | Supported (tested) |  |
| Thumbnail from a frame | ffmpeg-wasm, wasm-codec | Supported (tested) |  |
| GIF from a clip | ffmpeg-wasm | Supported (tested) |  |
| AV1 encoding | — | Not supported | The ffmpeg.wasm build has no AV1 encoder; WebCodecs AV1 encoding is not exposed yet. |
| Server-side processing | server | Planned | Disabled in this release (ENABLE_SERVER_PROCESSING=false). |
