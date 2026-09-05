import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RANDOM_LIGHT_COLORS,
  baseLightColor,
  districtLightColor,
  districtPower,
  isLightColor,
  snowflakeAt,
  snowflakePath,
  raindropAt,
  themeLightColor,
} from "../src/scene-effects.mjs";

test("quiet audio cuts power; loud music restores every district", () => {
  const quiet = Array.from({ length: 30 }, () => [0, 0, 0]);
  const loud = Array.from({ length: 30 }, () => [0.95, 0.95, 0.95]);
  for (let district = 0; district < 7; district++) {
    assert.equal(districtPower(quiet, 20, district, 65), 0);
    assert.equal(districtPower(loud, 20, district, 65), 1);
  }
});
test("rain streaks drift downward with repeatable variation", () => {
  const first = raindropAt(0, 0, 30),
    next = raindropAt(0, 1, 30);
  assert.ok(next.y > first.y);
  assert.ok(next.x > first.x);
  assert.deepEqual(next, raindropAt(0, 1, 30));
  assert.notEqual(first.length, raindropAt(1, 0, 30).length);
  for (let i = 0; i < 160; i++) {
    const drop = raindropAt(i, 8999, 30);
    assert.ok(drop.x >= -50 && drop.x < 1650 && drop.y >= -60 && drop.y < 960);
  }
});
test("districts respond to their frequency band and fade out after a beat", () => {
  const audio = Array.from({ length: 30 }, (_, i) =>
    i < 15 ? [1, 0, 0] : [0, 0, 0],
  );
  assert.equal(districtPower(audio, 14, 0, 65), 1);
  assert.equal(districtPower(audio, 14, 1, 65), 0);
  assert.equal(districtPower(audio, 14, 2, 65), 0);
  assert.ok(districtPower(audio, 18, 0, 65) > 0);
  assert.ok(districtPower(audio, 18, 0, 65) < 1);
  assert.equal(districtPower(audio, 23, 0, 65), 0);
  assert.equal(districtPower([], 0, 0, 65), 0);
});
test("snow falls at three depths and stays deterministic across seeks", () => {
  const first = snowflakeAt(3, 0, 30),
    next = snowflakeAt(3, 30, 30);
  assert.ok(next.y > first.y);
  assert.deepEqual(next, snowflakeAt(3, 30, 30));
  assert.notEqual(first.rotation, next.rotation);
  assert.notEqual(snowflakePath(1), snowflakePath(2));
  assert.equal((snowflakePath(1).match(/M0,0/g) ?? []).length, 6);
  assert.notEqual(snowflakeAt(1, 0, 30).radius, snowflakeAt(2, 0, 30).radius);
  for (let i = 0; i < 180; i++) {
    const flake = snowflakeAt(i, 8999, 30);
    assert.ok(
      flake.x >= -20 && flake.x < 1620 && flake.y >= -30 && flake.y < 930,
    );
  }
});
test("theme mode keeps the default light color per atmosphere", () => {
  assert.equal(themeLightColor("midnight"), "#e6c283");
  assert.equal(themeLightColor("christmas"), "#e6c283");
  assert.equal(themeLightColor("rain"), "#9bbfc8");
  assert.equal(themeLightColor("moonlight"), "#b5d2e0");
  assert.equal(baseLightColor("rain", "theme", "#e6c283"), "#9bbfc8");
});
test("christmas theme mode keeps its red and green district pattern", () => {
  assert.equal(districtLightColor(0, "christmas", "theme", "#e6c283"), "#d77a70");
  assert.equal(districtLightColor(1, "christmas", "theme", "#e6c283"), "#85bc9c");
  assert.equal(districtLightColor(2, "christmas", "theme", "#e6c283"), "#e6c283");
});
test("custom mode paints every district with the picked color", () => {
  for (let i = 0; i < 7; i++)
    assert.equal(districtLightColor(i, "midnight", "custom", "#ff8844"), "#ff8844");
  assert.equal(baseLightColor("rain", "custom", "#ff8844"), "#ff8844");
  assert.ok(isLightColor("#ff8844"));
  assert.ok(!isLightColor("red"));
  assert.ok(!isLightColor("#fff"));
});
test("custom mode falls back to the theme color for invalid picks", () => {
  assert.equal(districtLightColor(0, "rain", "custom", "nope"), "#9bbfc8");
  assert.equal(districtLightColor(0, "rain", "custom", undefined), "#9bbfc8");
  assert.equal(baseLightColor("moonlight", "custom", "#12345"), "#b5d2e0");
});
test("random mode deals each district a steady palette color", () => {
  const colors = Array.from({ length: 7 }, (_, i) =>
    districtLightColor(i, "midnight", "random", "#e6c283"),
  );
  for (const color of colors) assert.ok(RANDOM_LIGHT_COLORS.includes(color));
  assert.equal(new Set(colors).size, colors.length);
  assert.deepEqual(
    colors,
    Array.from({ length: 7 }, (_, i) =>
      districtLightColor(i, "christmas", "random", "#ffffff"),
    ),
  );
});
