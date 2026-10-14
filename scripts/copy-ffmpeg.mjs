// Copies the ffmpeg.wasm core files into public/ffmpeg so they are self-hosted (spec §5).
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  { from: 'node_modules/@ffmpeg/core/dist/esm', to: 'public/ffmpeg/st', files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
  {
    from: 'node_modules/@ffmpeg/core-mt/dist/esm',
    to: 'public/ffmpeg/mt',
    files: ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'],
  },
];

for (const { from, to, files } of targets) {
  mkdirSync(join(root, to), { recursive: true });
  for (const file of files) {
    const src = join(root, from, file);
    if (!existsSync(src)) throw new Error(`Missing ${src}. Run npm install.`);
    cpSync(src, join(root, to, file));
  }
}
console.log('ffmpeg core copied to public/ffmpeg');
