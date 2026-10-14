// Downloads the background-removal model (pinned revision, SHA-256 checked), patches it so it runs on
// WebGPU (see onnx-split-wide-nodes.mjs) and writes it to public/models so it is self-hosted like ffmpeg.wasm.
// Downloads are cached in .cache/models; the patched output is only rebuilt when it is missing or stale.
// Set SKIP_MODELS=1 to skip (the Remove background tool then reports that the model is unavailable).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitWideNodes } from './onnx-split-wide-nodes.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(readFileSync(join(root, 'src/lib/background-removal/model.json'), 'utf8'));
const outDir = join(root, 'public', model.dir);
const cacheDir = join(root, '.cache', 'models');
const manifestPath = join(outDir, 'manifest.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

if (process.env.SKIP_MODELS === '1') {
  console.log('SKIP_MODELS=1: background-removal model not fetched');
  process.exit(0);
}

function upToDate() {
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return Object.values(manifest.variants).every((v) => existsSync(join(outDir, v.file)));
  } catch {
    return false;
  }
}

async function download(variant) {
  const cached = join(cacheDir, `${model.revision}-${variant.file}`);
  if (existsSync(cached)) {
    const data = readFileSync(cached);
    if (sha256(data) === variant.sha256) return data;
  }
  const url = `${model.source}/resolve/${model.revision}/${variant.remote}`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${url}`);
  const total = Number(response.headers.get('content-length')) || 0;
  const chunks = [];
  let received = 0;
  let lastLog = 0;
  for await (const chunk of response.body) {
    chunks.push(chunk);
    received += chunk.length;
    if (total && received - lastLog > total / 10) {
      lastLog = received;
      console.log(`  ${Math.round((received / total) * 100)}%`);
    }
  }
  const data = Buffer.concat(chunks);
  const hash = sha256(data);
  if (hash !== variant.sha256) throw new Error(`Checksum mismatch for ${variant.remote}: expected ${variant.sha256}, got ${hash}`);
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, data);
  return data;
}

if (upToDate()) {
  console.log(`Background-removal model ready in public/${model.dir}`);
} else {
  mkdirSync(outDir, { recursive: true });
  const manifest = { name: model.name, revision: model.revision, patchVersion: model.patchVersion, variants: {} };
  for (const [id, variant] of Object.entries(model.variants)) {
    const original = await download(variant);
    const patched = splitWideNodes(original);
    writeFileSync(join(outDir, variant.file), patched.model);
    manifest.variants[id] = { file: variant.file, bytes: patched.model.length, sha256: sha256(patched.model) };
    console.log(`  ${variant.file}: split ${patched.concat.split} Concat, ${patched.split.split} Split, ${patched.sum} Sum nodes`);
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Background-removal model written to public/${model.dir}`);
}
