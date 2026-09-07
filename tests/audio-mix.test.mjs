import { test } from "node:test";
import assert from "node:assert/strict";
import { mixChannels, encodeWav } from "../src/audio-mix.mjs";

test("overlays sources from zero, preserves stereo, and leaves shorter tracks silent", () => {
  const mixed = mixChannels([
    [new Float32Array([1, -1])],
    [new Float32Array([0.5, 0.5, 0.5]), new Float32Array([-0.5, -0.5, -0.5])],
  ]);
  assert.deepEqual([...mixed[0]], [0.75, -0.25, 0.25]);
  assert.deepEqual([...mixed[1]], [0.25, -0.75, -0.25]);
});
test("equal source headroom prevents clipping with eight full-scale tracks", () => {
  const tracks = Array.from({ length: 8 }, () => [new Float32Array([1, -1])]);
  assert.deepEqual([...mixChannels(tracks)[0]], [1, -1]);
});
test("exports a playable stereo PCM WAV with interleaved samples", async () => {
  const blob = encodeWav(
    [new Float32Array([1, 0]), new Float32Array([-1, 0.5])],
    44100,
  );
  const data = new DataView(await blob.arrayBuffer());
  assert.equal(blob.type, "audio/wav");
  assert.equal(data.getUint16(22, true), 2);
  assert.equal(data.getUint32(24, true), 44100);
  assert.equal(data.getUint32(40, true), 8);
  assert.equal(data.getInt16(44, true), 32767);
  assert.equal(data.getInt16(46, true), -32768);
  assert.equal(data.getInt16(48, true), 0);
  assert.equal(data.getInt16(50, true), 16384);
});
