import { MediaError } from '@/lib/media/errors';

/** BiRefNet returns logits: sigmoid converts them to foreground opacity. */
export function alphaMaskFromLogits(values: Float32Array, size: number): Uint8Array {
  if (values.length !== size * size) {
    throw new MediaError('ENCODER_FAILED', 'The AI model returned an unexpected mask size.');
  }
  const mask = new Uint8Array(values.length);
  let foreground = 0;
  let background = 0;
  for (let i = 0; i < values.length; i++) {
    const value = values[i]!;
    if (!Number.isFinite(value)) {
      throw new MediaError(
        'VALIDATION_FAILED',
        'The AI model could not produce a usable cutout. Try again.',
      );
    }
    const alpha = Math.round(255 / (1 + Math.exp(-value)));
    mask[i] = alpha;
    if (alpha > 127) foreground++;
    if (alpha <= 25) background++;
  }
  if (foreground < values.length * 0.002) {
    throw new MediaError(
      'VALIDATION_FAILED',
      'No clear subject was found in this image, so there was nothing to keep. Try a photo with a distinct foreground subject.',
    );
  }
  // Uniform or nearly opaque masks only fade the image; they do not remove its background.
  if (background < values.length * 0.002) {
    throw new MediaError(
      'VALIDATION_FAILED',
      'The AI could not separate the background from the subject. No cutout was saved. Try a photo with a clearer foreground subject.',
    );
  }
  return mask;
}
