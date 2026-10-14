export function splitWideNodes(
  model: Uint8Array,
  maxBuffers?: number,
): {
  model: Buffer;
  concat: { split: number; largest: number };
  split: { split: number; largest: number; skipped: number };
  sum: number;
};
