import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function response() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("serverless location search and map loading return a new map and JSON errors", async (t) => {
  // Keep generated snapshots and cache pruning away from the studio's maps.
  const cwd = process.cwd();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "watt-map-api-"));
  process.chdir(temporary);
  t.after(async () => {
    process.chdir(cwd);
    await fs.rm(temporary, { recursive: true, force: true });
  });
  await fs.mkdir(path.join(temporary, ".cache/maps"), { recursive: true });

  // Import the actual deployment entry points: Express-only tests miss broken
  // imports in these handlers, which make the platform return a non-JSON 500.
  const { default: maps } = await import("../api/maps.js");
  const { default: locations } = await import("../api/locations.js");
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    if (options.method !== "POST") {
      return Response.json({
        features: [{
          properties: { countrycode: "PH", name: "Baguio" },
          geometry: { type: "Point", coordinates: [120.596, 16.402] },
        }],
      });
    }
    return Response.json({
      elements: [{
        type: "way",
        id: 4,
        tags: { highway: "primary" },
        geometry: [
          { lat: 16.402, lon: 120.595 },
          { lat: 16.402, lon: 120.597 },
        ],
      }],
    });
  });

  const search = response();
  await locations({ method: "GET", query: { q: "Baguio" } }, search);
  assert.equal(search.statusCode, 200);
  const { token } = search.body.results[0];
  assert.ok(token);

  const loaded = response();
  await maps({ method: "POST", body: { token } }, loaded);
  assert.equal(loaded.statusCode, 200);
  assert.equal(loaded.headers["Cache-Control"], "no-store");
  assert.equal(loaded.body.name, "Baguio");
  assert.equal(loaded.body.roadCount, 1);
  assert.equal(loaded.body.view.lat, 16.402);
  assert.equal(loaded.body.view.lon, 120.596);
  assert.match(loaded.body.id, /^[a-f0-9]{24}$/);
  assert.deepEqual(loaded.body.districts.map((d) => d.name), ["Baguio"]);
  assert.equal(calls.length, 2);

  const rejected = response();
  await maps({ method: "POST", body: { token: "invalid" } }, rejected);
  assert.equal(rejected.statusCode, 400);
  assert.match(rejected.body.error, /search for your location again/i);
  assert.equal(calls.length, 2, "invalid tokens must not reach the map provider");
});
