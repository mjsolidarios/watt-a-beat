import test from "node:test";
import assert from "node:assert/strict";
import { addBuildings, buildingQuery } from "../src/buildings.mjs";
import { buildArea } from "../src/map-geometry.mjs";

const map = {
  bounds: [0, 0, 16, 9],
  districts: [
    { name: "West", point: [400, 450], roads: [], lights: [] },
    { name: "East", point: [1200, 450], roads: [], lights: [] },
  ],
};
const geometry = (points) => points.map(([lon, lat]) => ({ lon, lat }));
const rectangle = (x, y, size = 1) =>
  geometry([
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ]);
const way = (id, points) => ({
  id,
  type: "way",
  tags: { building: "yes" },
  geometry: points,
});

test("building footprints follow the street projection and district assignment", () => {
  const result = addBuildings(
    { elements: [way(1, rectangle(3, 4)), way(2, rectangle(11, 4))] },
    map,
  );
  assert.equal(result.buildingCount, 2);
  assert.equal(result.districts[0].buildings.length, 1);
  assert.equal(result.districts[1].buildings.length, 1);
  assert.deepEqual(
    result.districts[0].buildings[0].bounds,
    [300, 400, 400, 500],
  );
  assert.equal(
    result.districts[0].buildings[0].d,
    "M300,500L400,500L400,400L300,400L300,500Z",
  );
  assert.equal(map.districts[0].buildings, undefined);
});

test("footprints crossing the map edge stay closed and inside the viewport", () => {
  const result = addBuildings(
    { elements: [way(1, rectangle(-0.5, 4)), way(2, rectangle(-3, 4))] },
    map,
  );
  assert.equal(result.buildingCount, 1);
  const building = result.districts[0].buildings[0];
  assert.deepEqual(building.bounds, [0, 400, 50, 500]);
  assert.ok(building.d.endsWith("Z"));
});

test("multipolygon members join in reverse order, preserve courtyards, and are not duplicated", () => {
  const outer = rectangle(3, 3, 3),
    inner = rectangle(4, 4);
  const result = addBuildings(
    {
      elements: [
        {
          type: "relation",
          tags: { building: "yes", type: "multipolygon" },
          members: [
            { type: "way", ref: 1, role: "outer", geometry: outer.slice(0, 3) },
            {
              type: "way",
              ref: 2,
              role: "outer",
              geometry: outer.slice(2).reverse(),
            },
            { type: "way", ref: 3, role: "inner", geometry: inner },
          ],
        },
        way(3, inner),
      ],
    },
    map,
  );
  assert.equal(result.buildingCount, 1);
  assert.equal(
    (result.districts[0].buildings[0].d.match(/Z/g) ?? []).length,
    2,
  );
});

test("open, missing, nonfinite, degenerate, and non-building geometry is discarded", () => {
  const result = addBuildings(
    {
      elements: [
        way(1, rectangle(3, 4).slice(0, 4)),
        way(2, undefined),
        way(3, [{ lat: NaN, lon: 3 }, ...rectangle(3, 4)]),
        way(4, rectangle(3, 4, 0)),
        { ...way(5, rectangle(3, 4)), tags: { building: "no" } },
      ],
    },
    map,
  );
  assert.equal(result.buildingCount, 0);
});

test("newly loaded areas include footprints even when they have no streets", () => {
  const result = buildArea(
    { elements: [way(1, rectangle(122.55, 10.717, 0.001))] },
    { name: "Iloilo City" },
    { lat: 10.717, lon: 122.55, widthKm: 14 },
  );
  assert.equal(result.buildingCount, 1);
  assert.equal(result.roadCount, 0);
  assert.equal(result.districts[0].buildings.length, 1);
  assert.match(buildingQuery("1,2,3,4"), /way\[building\]/);
  assert.match(
    buildingQuery("1,2,3,4"),
    /relation\[type=multipolygon\]\[building\]/,
  );
});
