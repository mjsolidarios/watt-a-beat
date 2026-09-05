import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArea,
  clipSegment,
  visibleBounds,
  nextView,
  geographicBounds,
} from "../src/map-geometry.mjs";
import {
  filterPhilippineResults,
  getMapSnapshot,
} from "../server/map-service.mjs";
import { validateSettings } from "../server/validate.mjs";

test("street segments are clipped to the viewport, not retained offscreen", () => {
  assert.deepEqual(clipSegment([-20, 100], [1700, 100]), [
    [0, 100],
    [1600, 100],
  ]);
  assert.equal(clipSegment([-20, 100], [-10, 800]), null);
  assert.deepEqual(visibleBounds(2, { x: 0, y: 0 }), [400, 225, 1200, 675]);
});
test("new map has only local zones and bounded streets and lights", () => {
  const view = { lat: 10.3, lon: 123.9, widthKm: 10 };
  const map = buildArea(
    {
      elements: [
        {
          type: "node",
          lat: 10.3,
          lon: 123.9,
          tags: { name: "Cebu City", place: "city" },
        },
        {
          id: 4,
          tags: { highway: "primary" },
          geometry: [
            { lat: 10.3, lon: 123.7 },
            { lat: 10.3, lon: 124.1 },
          ],
        },
        {
          id: 8,
          tags: { highway: "primary" },
          geometry: [
            { lat: 11, lon: 124 },
            { lat: 11, lon: 124.1 },
          ],
        },
      ],
    },
    { name: "Cebu City" },
    view,
  );
  assert.equal(map.roadCount, 1);
  assert.deepEqual(
    map.districts.map((d) => d.name),
    ["Cebu City"],
  );
  for (const d of map.districts)
    for (const r of d.roads) {
      assert.ok(
        r.bounds[0] >= 0 &&
          r.bounds[1] >= 0 &&
          r.bounds[2] <= 1600 &&
          r.bounds[3] <= 900,
      );
    }
  const zoomed = nextView(map, 2, { x: 160, y: 90 });
  assert.equal(zoomed.widthKm, 5);
  assert.ok(zoomed.lon < view.lon && zoomed.lat > view.lat);
  assert.equal(geographicBounds(view).length, 4);
});
test("geocoding rejects foreign countries and invalid Philippine coordinates", () => {
  const feature = (countrycode, coordinates) => ({
    properties: { countrycode, name: "Place" },
    geometry: { type: "Point", coordinates },
  });
  const results = filterPhilippineResults({
    features: [
      feature("PH", [123.9, 10.3]),
      feature("JP", [139, 35]),
      feature("PH", [139, 35]),
      feature("PH", [NaN, 10]),
    ],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].country, "PH");
});
test("export validates the selected map zones and cannot read arbitrary files", async () => {
  const settings = {
    theme: "rain",
    duration: 1,
    intensity: 70,
    sensitivity: 60,
    zoom: 1,
    resolution: 720,
    enabled: ["Cebu City"],
    envelopes: Array.from({ length: 30 }, () => [0.5, 0.5, 0.5]),
  };
  assert.deepEqual(
    validateSettings(settings, { districts: [{ name: "Cebu City" }] }).enabled,
    ["Cebu City"],
  );
  assert.throws(() =>
    validateSettings(
      { ...settings, enabled: ["Jaro"] },
      { districts: [{ name: "Cebu City" }] },
    ),
  );
  await assert.rejects(
    getMapSnapshot("../../package.json"),
    /Invalid map snapshot/,
  );
  const initial = await getMapSnapshot("iloilo-default");
  assert.equal(initial.districts.length, 7);
  assert.ok(initial.location.token);
});
