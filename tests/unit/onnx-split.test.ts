// The model patch must not change results: build a tiny ONNX graph with a wide Concat, a wide Split and
// a Sum, patch it, and compare both models' outputs with onnxruntime (WASM backend in Node).
import * as ort from 'onnxruntime-web';
import { describe, expect, it } from 'vitest';
import { splitWideNodes } from '../../scripts/onnx-split-wide-nodes.mjs';

const varint = (value: number | bigint) => {
  let v = BigInt.asUintN(64, BigInt(value));
  const out: number[] = [];
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Buffer.from(out);
};
const ld = (field: number, payload: Buffer) => Buffer.concat([varint((field << 3) | 2), varint(payload.length), payload]);
const str = (field: number, s: string) => ld(field, Buffer.from(s));
const num = (field: number, value: number) => Buffer.concat([varint(field << 3), varint(value)]);

const intAttr = (name: string, value: number) => Buffer.concat([str(1, name), num(3, value), num(20, 2)]);
const node = (op: string, inputs: string[], outputs: string[], attrs: Buffer[] = []) =>
  ld(1, Buffer.concat([...inputs.map((i) => str(1, i)), ...outputs.map((o) => str(2, o)), str(3, `${op}_${outputs[0]}`), str(4, op), ...attrs.map((a) => ld(5, a))]));
const int64Const = (name: string, values: number[]) => {
  const raw = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => raw.writeBigInt64LE(BigInt(v), i * 8));
  const tensor = Buffer.concat([num(1, values.length), num(2, 7), ld(9, raw)]);
  return node('Constant', [], [name], [Buffer.concat([str(1, 'value'), ld(5, tensor), num(20, 4)])]);
};
const valueInfo = (field: number, name: string, dims: number[]) => {
  const shape = Buffer.concat(dims.map((d) => ld(1, num(1, d))));
  const tensorType = Buffer.concat([num(1, 1), ld(2, shape)]);
  return ld(field, Buffer.concat([str(1, name), ld(2, ld(1, tensorType))]));
};

const INPUTS = 20;
const SIZES = [1, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 2];

function buildModel(): Buffer {
  const xs = Array.from({ length: INPUTS }, (_, i) => `x${i}`);
  const parts = SIZES.map((_, i) => `part${i}`);
  const graph = Buffer.concat([
    node('Concat', xs, ['joined'], [intAttr('axis', 0)]),
    int64Const('sizes', SIZES),
    node('Split', ['joined', 'sizes'], parts, [intAttr('axis', 0)]),
    node('Sum', ['x0', 'x1', 'x2'], ['total']),
    str(2, 'test'),
    ...xs.map((x) => valueInfo(11, x, [1, 2])),
    ...parts.map((p, i) => valueInfo(12, p, [SIZES[i]!, 2])),
    valueInfo(12, 'total', [1, 2]),
  ]);
  return Buffer.concat([num(1, 8), ld(8, num(2, 17)), ld(7, graph)]);
}

async function run(model: Uint8Array, feeds: Record<string, ort.Tensor>) {
  const session = await ort.InferenceSession.create(model);
  const out = await session.run(feeds);
  const result = Object.fromEntries(Object.entries(out).map(([k, t]) => [k, Array.from(t.data as Float32Array)]));
  await session.release();
  return result;
}

describe('splitWideNodes', () => {
  it('rewrites wide Concat/Split and Sum without changing results', async () => {
    const original = buildModel();
    const patched = splitWideNodes(original, 8);
    expect(patched.concat).toEqual({ split: 1, largest: INPUTS });
    expect(patched.split).toEqual({ split: 1, largest: SIZES.length, skipped: 0 });
    expect(patched.sum).toBe(1);

    const feeds = Object.fromEntries(
      Array.from({ length: INPUTS }, (_, i) => [`x${i}`, new ort.Tensor('float32', Float32Array.from([i + 0.25, -i * 1.5]), [1, 2])]),
    );
    const before = await run(original, feeds);
    const after = await run(patched.model, feeds);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(after).toEqual(before);
    expect(after.total).toEqual([0.25 + 1.25 + 2.25, 0 - 1.5 - 3]);
  });

  it('leaves narrow nodes untouched', () => {
    const original = buildModel();
    const patched = splitWideNodes(original, 64);
    expect(patched.concat.split).toBe(0);
    expect(patched.split.split).toBe(0);
    expect(patched.sum).toBe(1);
  });
});
