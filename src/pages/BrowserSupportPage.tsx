import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { detectWebGpu } from '@/lib/background-removal/engine';
import { detectFeatures } from '@/lib/media/features';
import { getLimits, detectDeviceProfile } from '@/lib/media/limits';
import { formatBytes } from '@/lib/media/sizes';
import { StaticPage } from './StaticPage';

export default function BrowserSupportPage() {
  const features = useMemo(() => detectFeatures(), []);
  const limits = getLimits();
  const [webGpu, setWebGpu] = useState(false);
  useEffect(() => {
    let active = true;
    void detectWebGpu().then((r) => {
      if (active) setWebGpu(r.available);
    });
    return () => {
      active = false;
    };
  }, []);
  const rows: [string, boolean, string][] = [
    ['WebAssembly', features.webAssembly, 'Required for all image and video processing.'],
    ['Web Workers', features.workers, 'Keeps the page responsive while processing.'],
    ['OffscreenCanvas', features.offscreenCanvas, 'Required to decode and transform images in a worker.'],
    ['Cross-origin isolation', features.crossOriginIsolated, 'Enables multithreaded ffmpeg.wasm (faster video).'],
    ['SharedArrayBuffer', features.sharedArrayBuffer, 'Needed for multithreading.'],
    ['WebCodecs', features.webCodecs, 'Hardware-accelerated video encoding; ffmpeg.wasm is used otherwise.'],
    ['WebGPU', webGpu, 'Required for Remove background (runs the AI model on the GPU).'],
    ['ImageDecoder', features.imageDecoder, 'Not required.'],
  ];

  return (
    <StaticPage title="Browser support & limitations" intro="Supported: the latest two versions of Chrome, Edge and Firefox; Safari and iOS Safari 16.4+; Chrome for Android.">
      <h2>Your browser</h2>
      <table>
        <tbody>
          {rows.map(([name, ok, note]) => (
            <tr key={name}>
              <td className="w-8">{ok ? <CircleCheck className="size-5 text-success" aria-label="Available" /> : <CircleX className="size-5 text-danger" aria-label="Not available" />}</td>
              <td className="font-medium">{name}</td>
              <td className="text-muted">{note}</td>
            </tr>
          ))}
          <tr>
            <td />
            <td className="font-medium">Device profile</td>
            <td className="text-muted">
              {detectDeviceProfile()} — images up to {formatBytes(limits.imageBytes)} / {(limits.imagePixels / 1e6).toFixed(1)} MP, videos up to {formatBytes(limits.videoBytes)} /{' '}
              {Math.round(limits.videoSeconds / 60)} min / {limits.videoMaxEdge}px, GIFs up to {limits.gifSeconds} s, {limits.batchFiles} files per batch.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>Known limitations</h2>
      <ul>
        <li>Video processing runs in WebAssembly and is several times slower than desktop software. VP9 encoding is especially slow; H.264 is the fastest.</li>
        <li>WebAssembly memory is capped at about 2 GB, and phones have far less, so long or high-resolution videos may fail with an out-of-memory error.</li>
        <li>Chrome and Firefox can’t play MKV, HEVC or ProRes directly. The video tools generate a low-resolution preview instead; processing still uses the original.</li>
        <li>AV1 video can only be read where the browser has a WebCodecs AV1 decoder; there is no AV1 encoder.</li>
        <li>HEIC and TIFF images can be opened only in browsers that decode them natively (Safari).</li>
        <li>Animated GIF, WebP and APNG are converted using their first frame in the image tools. Use Video → Convert to keep GIF animation.</li>
        <li>Remove background needs WebGPU and downloads a 115 MB AI model the first time (kept on the device afterwards).</li>
        <li>Re-encoding removes EXIF, GPS and colour-profile metadata, and converts colours to sRGB.</li>
        <li>iOS Safari limits canvas size to about 16.7 megapixels, so larger images are rejected on iPhone and iPad.</li>
        <li>On iOS, downloads open in a preview; use Share → Save to Files/Photos to keep the result.</li>
      </ul>
    </StaticPage>
  );
}
