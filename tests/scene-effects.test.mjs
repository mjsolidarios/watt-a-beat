import { test } from "node:test";
import assert from "node:assert/strict";
import {
  districtPower,
  snowflakeAt,
  snowflakePath,
  raindropAt,
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
