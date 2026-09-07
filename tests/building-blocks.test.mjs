import test from "node:test";
import assert from "node:assert/strict";
import {
  footprintRings,
  extrudeBuilding,
  buildingBlockBatches,
} from "../src/building-blocks.mjs";

const building = {
  d: "M100,100L120,100L120,120L100,120L100,100Z",
  bounds: [100, 100, 120, 120],
};
test("blocks keep their bases on the footprint and lift closed roofs deterministically", () => {
  const block = extrudeBuilding(building);
  assert.deepEqual(block, extrudeBuilding(building));
  assert.match(block.front + block.left, /120\.00,120\.00/);
  const roof = footprintRings(block.roof)[0];
  assert.equal(roof.length, 4);
  assert.ok(Math.abs(roof[0][0] - (100 - block.height / 2)) < 0.01);
  assert.ok(Math.abs(roof[0][1] - (100 - block.height)) < 0.01);
  assert.ok(block.front && block.left && block.windows);
  const reversed = extrudeBuilding({
    ...building,
    d: "M100,100L100,120L120,120L120,100Z",
  });
  assert.ok(reversed.front && reversed.left);
});
test("courtyards remain separate roof rings; unsupported or invalid geometry is skipped", () => {
  const hollow = extrudeBuilding({
    ...building,
    d: building.d + "M105,105L105,115L115,115L115,105Z",
  });
  assert.equal(footprintRings(hollow.roof).length, 2);
  assert.equal(extrudeBuilding({ ...building, d: "M0 0 h20 v20 Z" }), null);
  assert.equal(extrudeBuilding({ ...building, bounds: [0, 0, NaN, 20] }), null);
  assert.equal(extrudeBuilding({ ...building, d: "M0 0L1 1Z" }), null);
});
test("dense regions use bounded geometry batches without dropping buildings", () => {
  const batches = buildingBlockBatches(
    Array.from({ length: 1000 }, () => building),
  );
  assert.equal(batches.length, 42);
  assert.equal(
    batches.reduce((n, b) => n + b.count, 0),
    1000,
  );
  assert.ok(batches.every((b) => b.count <= 24 && !b.roof.includes("NaN")));
});
