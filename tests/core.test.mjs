import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeSamples } from "../src/audio-analysis.mjs";
import { validateSettings } from "../server/validate.mjs";
test("silence does not illuminate the reactive envelopes", () => {
  const result = analyzeSamples(new Float32Array(44100), 44100);
  assert.equal(result.length, 30);
  assert.ok(result.flat().every((v) => v === 0));
});
test("bass and treble are separated and normalized", () => {
  const rate = 44100;
  const tone = (f) =>
    Float32Array.from(
      { length: rate },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * f * i) / rate),
    );
  for (const f of [60, 4000]) {
    const result = analyzeSamples(tone(f), rate);
    assert.equal(result.length, 30);
    assert.ok(
      result.flat().every((v) => Number.isFinite(v) && v >= 0 && v <= 1),
    );
    assert.ok(result[10].some((v) => v > 0.5));
  }
});
const settings = {
  theme: "midnight",
  duration: 1,
  intensity: 70,
  sensitivity: 65,
  zoom: 1,
  resolution: 720,
  enabled: ["Jaro"],
  envelopes: Array.from({ length: 30 }, () => [0.5, 0.3, 0.1]),
  labels: true,
  particles: true,
};
test("export permits valid props and strips external audio URLs", () => {
  const output = validateSettings({
    ...settings,
    audioSrc: "https://example.com",
    onSelect: "untrusted",
  });
  assert.equal(output.audioSrc, undefined);
  assert.equal(output.onSelect, undefined);
  assert.equal(output.resolution, 720);
});
test("rain theme and particle toggle survive export validation", () => {
  const output = validateSettings({
    ...settings,
    theme: "rain",
    particles: false,
  });
  assert.equal(output.theme, "rain");
  assert.equal(output.particles, false);
});
test("export validation defaults to theme light colors", () => {
  const output = validateSettings({ ...settings });
  assert.equal(output.colorMode, "theme");
  assert.equal(output.lightColor, "#e6c283");
});
test("export validation keeps custom and random light colors", () => {
  const custom = validateSettings({
    ...settings,
    colorMode: "custom",
    lightColor: "#ff8844",
  });
  assert.equal(custom.colorMode, "custom");
  assert.equal(custom.lightColor, "#ff8844");
  const random = validateSettings({
    ...settings,
    colorMode: "random",
    lightColor: "#ff8844",
  });
  assert.equal(random.colorMode, "random");
});
test("export validation rejects bad color modes and resets bad colors", () => {
  assert.throws(() =>
    validateSettings({ ...settings, colorMode: "rainbow" }),
  );
  const output = validateSettings({
    ...settings,
    colorMode: "custom",
    lightColor: "not-a-color",
  });
  assert.equal(output.lightColor, "#e6c283");
});
test('export preserves the map position and rejects invalid pan values', () => {
  assert.deepEqual(validateSettings({...settings, pan:{x:120,y:-60}}).pan, {x:120,y:-60});
  assert.throws(()=>validateSettings({...settings, pan:{x:Infinity,y:0}}));
});
test("export rejects oversized duration, malformed levels and invalid areas", () => {
  for (const override of [
    { duration: 301 },
    { envelopes: [[Infinity, 0, 0]] },
    { enabled: ["unknown"] },
    { resolution: 4000 },
    { intensity: -1 },
  ])
    assert.throws(() => validateSettings({ ...settings, ...override }));
});
