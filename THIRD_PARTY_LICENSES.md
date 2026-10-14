# Third-party licenses

Components shipped to the browser in the production build. Full licence texts are in each package's `LICENSE` file under `node_modules/` and are copied into `dist/` by the host's normal static-file serving of `/ffmpeg/*` and `/assets/*`.

| Component | Version | License | Notes |
| --- | --- | --- | --- |
| @ffmpeg/core, @ffmpeg/core-mt (FFmpeg compiled to WebAssembly) | 0.12.10 (FFmpeg 5.1) | **GPL-2.0-or-later** | Built with `--enable-gpl` and includes x264 (GPL), x265 (GPL), libvpx (BSD), LAME (LGPL), Opus/Vorbis/Theora (BSD), libwebp (BSD), zimg (WTFPL), freetype/fribidi/libass. Source: https://github.com/ffmpegwasm/ffmpeg.wasm and https://ffmpeg.org |
| @ffmpeg/ffmpeg, @ffmpeg/util | 0.12.15 / 0.12.2 | MIT | |
| mediabunny | 1.61.4 | MPL-2.0 | File-level copyleft: modifications to its files must be shared under MPL-2.0. Used unmodified. |
| @jsquash/jpeg, webp, avif, png, oxipng, resize | 1.6.0, 1.5.0, 2.1.1, 3.1.1, 2.3.0, 2.1.1 | Apache-2.0 | Wrap MozJPEG (IJG/BSD-3), libwebp (BSD-3), libavif + aom (BSD-2), squoosh PNG (Apache-2.0), OxiPNG (MIT), squoosh resize (Apache-2.0). |
| gifenc | 1.0.3 | MIT | GIF encoder and colour quantizer (also used for PNG palette mode). |
| client-zip | 2.5.1 | MIT | |
| onnxruntime-web | 1.30.0 | MIT | Runs the background-removal model (WebGPU execution provider). |
| BiRefNet-lite model (onnx-community/BiRefNet_lite-ONNX, from ZhengPeng7/BiRefNet) | revision de15b22 | MIT | Model weights, served from `/models`. The graph is restructured (Concat/Split/Sum) without changing the weights. |
| comlink | 4.4.2 | Apache-2.0 | |
| react, react-dom | 19.3.0 | MIT | |
| react-router | 7.18.4 | MIT | |
| radix-ui | 1.8.1 | MIT | |
| lucide-react | 1.57.0 | ISC | |
| zustand | 5.0.15 | MIT | |
| Inter (@fontsource-variable/inter) | 5.3.0 | OFL-1.1 | |

Development-only tools (not shipped): Vite, TypeScript, Tailwind CSS, ESLint, Vitest, Playwright, axe-core, sharp (Apache-2.0, bundles LGPL libvips), ffmpeg-static (GPL FFmpeg binary, used only to generate test fixtures).

## Items for the project owner to decide

These are flagged rather than decided (spec §5):

1. **GPL.** The ffmpeg.wasm core is GPL because it includes x264/x265. Serving it to browsers is distribution, so the corresponding source must be available (linking to the upstream ffmpeg.wasm/FFmpeg sources is the usual approach; this app does that on the Licenses page). If GPL is unacceptable, use a custom LGPL-only FFmpeg build without x264/x265 and rely on WebCodecs for H.264.
2. **Patents.** H.264, HEVC and AAC encoding/decoding carry patent-licensing considerations for commercial deployments (MPEG LA / Access Advance / Via LA pools). VP8, VP9, Opus and Vorbis are royalty-free. A commercial deployment should get legal advice.
3. **MPL-2.0 (Mediabunny)** has no obligations while it is used unmodified.
4. **Background-removal model.** BiRefNet-lite is MIT licensed, including the weights. The datasets it was trained on (DIS5K and others) have their own terms; for a commercial deployment, review the BiRefNet repository's dataset notes.
