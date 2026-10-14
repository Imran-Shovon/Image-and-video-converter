// Output validation for video/audio jobs (spec §8). A result is only offered for download if this passes.
import { sniff } from '@/lib/media/detect';
import { MediaError } from '@/lib/media/errors';
import type { OutputExpectation } from './args';
import type { VideoProbe } from './types';

const FORMAT_ALIASES: Record<OutputExpectation['format'], string[]> = {
  mp4: ['mp4', 'm4v', 'mov'],
  mov: ['mov', 'mp4'],
  webm: ['webm'],
  mkv: ['mkv', 'webm'],
  gif: ['gif'],
  mp3: ['mp3'],
  m4a: ['m4a', 'mp4'],
  wav: ['wav'],
  opus: ['opus', 'ogg'],
  png: ['png'],
};

export function verifyMediaOutput(head: Uint8Array, byteLength: number, probe: VideoProbe | null, expect: OutputExpectation): void {
  if (byteLength === 0) throw new MediaError('VALIDATION_FAILED', 'The output file is empty.');
  const sniffed = sniff(head);
  if (sniffed.kind !== 'known' || !FORMAT_ALIASES[expect.format].includes(sniffed.format)) {
    throw new MediaError('VALIDATION_FAILED', `The output is not a valid ${expect.format.toUpperCase()} file.`);
  }
  if (!probe) throw new MediaError('VALIDATION_FAILED', 'The output file could not be read back.');

  if (expect.video && !probe.video) throw new MediaError('VALIDATION_FAILED', 'The output has no video stream.');
  if (!expect.video && probe.video && expect.format !== 'png') {
    throw new MediaError('VALIDATION_FAILED', 'The output unexpectedly contains video.');
  }
  if (expect.audio && !probe.audio) throw new MediaError('VALIDATION_FAILED', 'The output is missing its audio stream.');
  if (!expect.audio && probe.audio) throw new MediaError('VALIDATION_FAILED', 'The output unexpectedly contains audio.');

  if (expect.video && probe.video && expect.width !== null && expect.height !== null) {
    if (probe.video.width !== expect.width || probe.video.height !== expect.height) {
      throw new MediaError('VALIDATION_FAILED', `The output is ${probe.video.width}×${probe.video.height} but ${expect.width}×${expect.height} was expected.`);
    }
  }

  if (expect.durationSec !== null && probe.durationSec !== null) {
    const diff = Math.abs(probe.durationSec - expect.durationSec);
    if (diff > expect.durationTolerance) {
      throw new MediaError(
        'VALIDATION_FAILED',
        `The output is ${probe.durationSec.toFixed(2)} s long but ${expect.durationSec.toFixed(2)} s was expected.`,
      );
    }
  }
}
