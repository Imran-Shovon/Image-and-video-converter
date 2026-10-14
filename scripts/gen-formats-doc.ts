// Generates docs/SUPPORTED_FORMATS.md from the capability matrix (spec §2.2). Run: npm run docs:formats
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_OUTPUTS, IMAGE_INPUTS, IMAGE_OUTPUTS, OPERATIONS, VIDEO_INPUTS, VIDEO_OUTPUTS, type CapabilityStatus } from '../src/lib/media/capabilities';
import { FORMATS } from '../src/lib/media/formats';

const STATUS: Record<CapabilityStatus, string> = {
  tested: 'Supported (tested)',
  'browser-dependent': 'Browser-dependent',
  implemented: 'Experimental (not advertised)',
  planned: 'Planned',
  unsupported: 'Not supported',
};

const row = (cells: (string | undefined)[]) => `| ${cells.map((c) => (c ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
const table = (head: string[], rows: (string | undefined)[][]) => [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');

const md = `# Supported formats

> Generated from \`src/lib/media/capabilities.ts\` by \`npm run docs:formats\`. Do not edit by hand.
> Only **Supported** and **Browser-dependent** entries are offered in the app.

## Image input

${table(['Format', 'Decoder', 'Status', 'Notes'], IMAGE_INPUTS.map((c) => [FORMATS[c.format].label, c.decode.join(', ') || '—', STATUS[c.status], c.notes]))}

## Image output

${table(['Format', 'Encoder', 'Lossy', 'Transparency', 'Status', 'Notes'], IMAGE_OUTPUTS.map((c) => [FORMATS[c.format].label, c.library, c.lossy ? 'Yes' : 'No', c.transparency ? 'Yes' : 'No', STATUS[c.status], c.notes]))}

## Video input

${table(['Container', 'Status', 'Notes'], VIDEO_INPUTS.map((c) => [FORMATS[c.format].label, STATUS[c.status], c.notes]))}

## Video output

${table(['Output', 'Engines', 'Status', 'Notes'], VIDEO_OUTPUTS.map((c) => [c.label, c.engines.join(', ') || '—', STATUS[c.status], c.notes]))}

## Audio output (Extract audio)

${table(['Format', 'Codec', 'Status', 'Notes'], AUDIO_OUTPUTS.map((c) => [FORMATS[c.format].label, c.codec, STATUS[c.status], c.notes]))}

## Operations

${table(['Operation', 'Engines', 'Status', 'Notes'], OPERATIONS.map((o) => [o.label, o.engines.join(', ') || '—', STATUS[o.status], o.notes]))}
`;

const target = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'SUPPORTED_FORMATS.md');
writeFileSync(target, md);
console.log(`Wrote ${target}`);
