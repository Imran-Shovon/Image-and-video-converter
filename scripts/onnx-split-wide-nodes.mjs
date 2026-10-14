// Rewrites ONNX Concat nodes with many inputs, and Split nodes with many outputs, into trees of smaller
// Concats/Splits. The result is mathematically identical. It exists because WebGPU limits storage buffers
// per shader stage (8 by default), and onnxruntime-web compiles each Concat/Split into one shader with one
// buffer per input and output.
//
// Works on the raw protobuf bytes so the (large) weights are copied untouched and no protobuf library
// is needed. Only the fields read below are interpreted; everything else is passed through verbatim.

function readVarint(buf, pos) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    const byte = buf[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if (byte < 0x80) return [result, pos];
    shift += 7n;
  }
}

function encodeVarint(value) {
  let v = BigInt.asUintN(64, BigInt(value));
  const out = [];
  while (v >= 0x80n) {
    out.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  out.push(Number(v));
  return Buffer.from(out);
}

/** Splits a message into its top-level fields, keeping each field's exact bytes. */
function fields(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    const start = pos;
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    let value = null;
    let number = null;
    if (wire === 0) [number, pos] = readVarint(buf, pos);
    else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else if (wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      value = buf.subarray(pos, pos + Number(len));
      pos += Number(len);
    } else throw new Error(`Unsupported protobuf wire type ${wire}`);
    out.push({ field, wire, value, number, raw: buf.subarray(start, pos) });
  }
  return out;
}

function lengthDelimited(field, payload) {
  return Buffer.concat([encodeVarint((field << 3) | 2), encodeVarint(payload.length), payload]);
}

const str = (field, s) => lengthDelimited(field, Buffer.from(s, 'utf8'));
const varintField = (field, value) => Buffer.concat([encodeVarint(field << 3), encodeVarint(value)]);

// NodeProto: input = 1, output = 2, name = 3, op_type = 4, attribute = 5, domain = 7.
function buildNode({ inputs, outputs, name, opType, attributes }) {
  return Buffer.concat([
    ...inputs.map((i) => str(1, i)),
    ...outputs.map((o) => str(2, o)),
    str(3, name),
    str(4, opType),
    ...attributes.map((a) => lengthDelimited(5, a)),
  ]);
}

/** A Constant node holding a 1-D int64 tensor. */
function int64Constant(name, values) {
  const raw = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => raw.writeBigInt64LE(BigInt(v), i * 8));
  // TensorProto: dims = 1, data_type = 2 (7 = INT64), raw_data = 9.
  const tensor = Buffer.concat([varintField(1, values.length), varintField(2, 7), lengthDelimited(9, raw)]);
  // AttributeProto: name = 1, t = 5, type = 20 (4 = TENSOR).
  const attribute = Buffer.concat([str(1, 'value'), lengthDelimited(5, tensor), varintField(20, 4)]);
  return buildNode({ inputs: [], outputs: [name], name, opType: 'Constant', attributes: [attribute] });
}

/** Reads the int64 values of a Constant node's `value` tensor, or null when it isn't one. */
function constantInt64s(parts) {
  for (const a of parts.filter((p) => p.field === 5)) {
    const af = fields(a.value);
    if (af.find((f) => f.field === 1)?.value.toString('utf8') !== 'value') continue;
    const t = fields(af.find((f) => f.field === 5)?.value ?? Buffer.alloc(0));
    if (t.find((f) => f.field === 2)?.number !== 7n) return null;
    const raw = t.find((f) => f.field === 9)?.value;
    if (raw) return Array.from({ length: raw.length / 8 }, (_, i) => Number(raw.readBigInt64LE(i * 8)));
    // int64_data = 7, packed or not.
    const out = [];
    for (const f of t.filter((x) => x.field === 7)) {
      if (f.wire === 0) out.push(Number(BigInt.asIntN(64, f.number)));
      else
        for (let pos = 0; pos < f.value.length; ) {
          let v;
          [v, pos] = readVarint(f.value, pos);
          out.push(Number(BigInt.asIntN(64, v)));
        }
    }
    return out.length ? out : null;
  }
  return null;
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function describe(node) {
  const parts = fields(node);
  const get = (f) => parts.filter((p) => p.field === f).map((p) => p.value);
  return {
    parts,
    opType: get(4)[0]?.toString('utf8'),
    domain: get(7)[0]?.toString('utf8') ?? '',
    inputs: get(1).map((b) => b.toString('utf8')),
    outputs: get(2).map((b) => b.toString('utf8')),
    name: get(3)[0]?.toString('utf8'),
    attributes: get(5),
  };
}

function splitConcat(node, maxInputs, stats) {
  const { opType, domain, inputs, outputs, name, attributes } = describe(node);
  if (opType !== 'Concat' || domain !== '' || inputs.length <= maxInputs) return [node];
  const output = outputs[0];
  const base = name || output;
  stats.split++;
  stats.largest = Math.max(stats.largest, inputs.length);

  // Build the tree bottom-up: concatenate chunks of inputs, repeat until few enough remain.
  const nodes = [];
  let level = inputs;
  let depth = 0;
  while (level.length > maxInputs) {
    level = chunks(level, maxInputs).map((chunk, i) => {
      if (chunk.length === 1) return chunk[0];
      const out = `${output}__concat_split_${depth}_${i}`;
      nodes.push(buildNode({ inputs: chunk, outputs: [out], name: `${base}__split_${depth}_${i}`, opType: 'Concat', attributes }));
      return out;
    });
    depth++;
  }
  nodes.push(buildNode({ inputs: level, outputs: [output], name: base, opType: 'Concat', attributes }));
  return nodes;
}

// Split (opset 13+, sizes given as a constant second input) with more than `maxOutputs` outputs becomes
// a first Split into contiguous groups, then one Split per group. Applied recursively for very wide splits.
function splitSplit(node, maxOutputs, constants, stats) {
  const { opType, domain, inputs, outputs, name, attributes } = describe(node);
  if (opType !== 'Split' || domain !== '' || outputs.length <= maxOutputs) return [node];
  const [input, sizesName] = inputs;
  const sizes = sizesName ? constants.get(sizesName) : undefined;
  if (!input || !sizes || sizes.length !== outputs.length) {
    stats.skipped++;
    return [node];
  }
  stats.split++;
  stats.largest = Math.max(stats.largest, outputs.length);

  const emit = (from, outs, sz, prefix) => {
    if (outs.length <= maxOutputs) {
      const c = `${prefix}__sizes`;
      return [int64Constant(c, sz), buildNode({ inputs: [from, c], outputs: outs, name: prefix, opType: 'Split', attributes })];
    }
    const groups = chunks(
      outs.map((o, i) => [o, sz[i]]),
      Math.ceil(outs.length / maxOutputs),
    );
    const groupOuts = groups.map((_, g) => `${prefix}__group_${g}`);
    const nodes = emit(
      from,
      groupOuts,
      groups.map((g) => g.reduce((sum, [, n]) => sum + n, 0)),
      `${prefix}__top`,
    );
    groups.forEach((g, i) => {
      if (g.length === 1) {
        nodes.push(buildNode({ inputs: [groupOuts[i]], outputs: [g[0][0]], name: `${prefix}__id_${i}`, opType: 'Identity', attributes: [] }));
      } else {
        nodes.push(...emit(groupOuts[i], g.map(([o]) => o), g.map(([, n]) => n), `${prefix}__part_${i}`));
      }
    });
    return nodes;
  };
  return emit(input, outputs, sizes, name || outputs[0]);
}

// onnxruntime-web's WebGPU EP has no Sum kernel, so Sum(a, b, c, …) becomes a chain of Adds.
function sumToAdds(node, stats) {
  const { opType, domain, inputs, outputs, name } = describe(node);
  if (opType !== 'Sum' || domain !== '') return [node];
  if (inputs.length === 1) return [buildNode({ inputs, outputs, name: name || outputs[0], opType: 'Identity', attributes: [] })];
  stats.sum++;
  const base = name || outputs[0];
  const nodes = [];
  let acc = inputs[0];
  for (let i = 1; i < inputs.length; i++) {
    const out = i === inputs.length - 1 ? outputs[0] : `${outputs[0]}__sum_${i}`;
    nodes.push(buildNode({ inputs: [acc, inputs[i]], outputs: [out], name: `${base}__add_${i}`, opType: 'Add', attributes: [] }));
    acc = out;
  }
  return nodes;
}

/**
 * @param {Buffer} model ONNX model bytes
 * @param {number} maxBuffers storage buffers allowed per shader (inputs + outputs)
 */
export function splitWideNodes(model, maxBuffers = 8) {
  const concat = { split: 0, largest: 0 };
  const split = { split: 0, largest: 0, skipped: 0 };
  const other = { sum: 0 };
  // ModelProto.graph = 7; GraphProto.node = 1 (nodes are kept in their original, topological order).
  const top = fields(model).map((f) => {
    if (f.field !== 7 || f.wire !== 2) return f.raw;
    const graphFields = fields(f.value);
    const constants = new Map();
    for (const g of graphFields) {
      if (g.field !== 1 || g.wire !== 2) continue;
      const { opType, outputs, parts } = describe(g.value);
      if (opType !== 'Constant') continue;
      const values = constantInt64s(parts);
      if (values && outputs[0]) constants.set(outputs[0], values);
    }
    const graph = graphFields.map((g) => {
      if (g.field !== 1 || g.wire !== 2) return g.raw;
      const nodes = sumToAdds(g.value, other)
        .flatMap((n) => splitConcat(n, maxBuffers - 1, concat))
        .flatMap((n) => splitSplit(n, maxBuffers - 1, constants, split));
      return Buffer.concat(nodes.map((n) => lengthDelimited(1, n)));
    });
    return lengthDelimited(7, Buffer.concat(graph));
  });
  return { model: Buffer.concat(top), concat, split, ...other };
}
