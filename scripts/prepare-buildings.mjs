import { readFile, writeFile } from "node:fs/promises";
import { addBuildings } from "../src/buildings.mjs";

// Enrich the bundled map without changing its existing streets or district layout.
const input = process.argv[2];
if (!input)
  throw new Error(
    "Usage: node scripts/prepare-buildings.mjs <overpass-building-data.json>",
  );
const file = new URL("../src/data/default-map.json", import.meta.url);
const map = JSON.parse(await readFile(file, "utf8"));
const osm = JSON.parse(await readFile(input, "utf8"));
if (osm.remark || !Array.isArray(osm.elements))
  throw new Error(osm.remark || "Missing OSM elements");
const enriched = addBuildings(osm, map);
if (!enriched.buildingCount)
  throw new Error("No valid building footprints in this area");
enriched.buildingsRetrieved =
  osm.osm3s?.timestamp_osm_base || new Date().toISOString();
await writeFile(file, JSON.stringify(enriched));
console.log({
  buildings: enriched.buildingCount,
  districts: enriched.districts.map((d) => ({
    name: d.name,
    buildings: d.buildings.length,
  })),
});
