import { Router, json } from "express";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { buildArea, geographicBounds } from "../src/map-geometry.mjs";

const secret = randomBytes(32),
  memorySearch = new Map(),
  pending = new Map();
const mapDir = path.join(process.cwd(), ".cache", "maps");
await fs.mkdir(mapDir, { recursive: true });
const userAgent = "WattABeat/1.0 (Philippines music map; local studio)";
let lastSearch = 0,
  mapBusy = false;
const defaultLocation = {
  name: "Iloilo City",
  description: "Western Visayas, Philippines",
  lat: 10.717,
  lon: 122.55,
  country: "PH",
};
function sign(location) {
  const payload = Buffer.from(JSON.stringify(location)).toString("base64url");
  return (
    payload + "." + createHmac("sha256", secret).update(payload).digest("hex")
  );
}
function verify(token) {
  if (typeof token !== "string" || token.length > 4000)
    throw new Error("Select a Philippine location from search results.");
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  if (
    !signature ||
    signature.length !== expected.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new Error("Please search for your location again.");
  const place = JSON.parse(Buffer.from(payload, "base64url"));
  if (place.country !== "PH")
    throw new Error("Only Philippine locations are supported.");
  return place;
}
export function filterPhilippineResults(data) {
  return (data.features ?? [])
    .filter(
      (f) =>
        f.properties?.countrycode?.toUpperCase() === "PH" &&
        f.geometry?.type === "Point",
    )
    .map((f) => {
      const p = f.properties,
        [lon, lat] = f.geometry.coordinates;
      return {
        name: p.name || p.street || p.city || "Selected location",
        description: [p.district, p.city, p.state, "Philippines"]
          .filter((v, i, a) => v && a.indexOf(v) === i)
          .join(", "),
        lat,
        lon,
        country: "PH",
      };
    })
    .filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        p.lat >= 4 &&
        p.lat <= 22 &&
        p.lon >= 116 &&
        p.lon <= 127,
    )
    .slice(0, 6);
}
async function readJsonResponse(response, limit = 20 * 1024 * 1024) {
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "The map service is busy. Please try again shortly."
        : "The map service is temporarily unavailable.",
    );
  let size = 0,
    chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit)
      throw new Error("This area is too detailed. Choose a smaller view.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function getMapSnapshot(id) {
  if (id === "iloilo-default") {
    return {
      ...JSON.parse(
        await fs.readFile(
          path.join(process.cwd(), "src/data/default-map.json"),
          "utf8",
        ),
      ),
      location: { ...defaultLocation, token: sign(defaultLocation) },
    };
  }
  if (typeof id !== "string" || !/^[a-f0-9]{24}$/.test(id))
    throw new Error("Invalid map snapshot.");
  try {
    const map = JSON.parse(
      await fs.readFile(path.join(mapDir, id + ".json"), "utf8"),
    );
    const { token: _token, ...location } = map.location;
    map.location = { ...location, token: sign(location) };
    return map;
  } catch {
    throw new Error(
      "This map snapshot expired. Reload the selected area before exporting.",
    );
  }
}
async function prune() {
  const entries = await fs.readdir(mapDir);
  const files = await Promise.all(
    entries
      .filter((n) => /^[a-f0-9]{24}\.json$/.test(n))
      .map(async (name) => ({
        name,
        time: (await fs.stat(path.join(mapDir, name))).mtimeMs,
      })),
  );
  for (const entry of files.sort((a, b) => b.time - a.time).slice(6))
    await fs.unlink(path.join(mapDir, entry.name)).catch(() => {});
}
async function loadArea(location, view, signal) {
  const id = createHash("sha256")
    .update(JSON.stringify({ name: location.name, ...view }))
    .digest("hex")
    .slice(0, 24);
  try {
    const stat = await fs.stat(path.join(mapDir, id + ".json"));
    if (Date.now() - stat.mtimeMs < 86400000) return await getMapSnapshot(id);
  } catch {}
  if (pending.has(id)) return pending.get(id);
  if (mapBusy)
    throw new Error("Another area is loading. Please try again in a moment.");
  const work = (async () => {
    mapBusy = true;
    try {
      const [west, south, east, north] = geographicBounds(view);
      const bbox = [south, west, north, east]
        .map((v) => v.toFixed(6))
        .join(",");
      const query = `[out:json][timeout:45][maxsize:67108864];(way[highway][highway!~"footway|steps|path|track|service"](${bbox});way[waterway~"river|stream"](${bbox});way[natural~"coastline|water"](${bbox});node[place~"suburb|quarter|neighbourhood|town|village|city"](${bbox}););out geom;`;
      const response = await fetch(
        process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": userAgent,
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
        },
      );
      const osm = await readJsonResponse(response);
      if (osm.remark)
        throw new Error(
          "The map provider could not finish this area. Please try a smaller view.",
        );
      const map = buildArea(osm, location, view);
      map.id = id;
      map.location = { ...location, token: sign(location) };
      await fs.writeFile(path.join(mapDir, id + ".json"), JSON.stringify(map));
      await prune();
      return map;
    } finally {
      mapBusy = false;
      pending.delete(id);
    }
  })();
  pending.set(id, work);
  return work;
}
export const mapRouter = Router();
mapRouter.get("/locations", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2 || q.length > 120)
      return res
        .status(400)
        .json({ error: "Enter a place name between 2 and 120 characters." });
    const key = q.toLowerCase();
    let results = memorySearch.get(key);
    if (!results) {
      if (Date.now() - lastSearch < 1100)
        return res
          .status(429)
          .json({ error: "Please wait a moment before searching again." });
      lastSearch = Date.now();
      const url = new URL(
        process.env.GEOCODER_URL || "https://photon.komoot.io/api/",
      );
      url.search = new URLSearchParams({
        q,
        countrycode: "PH",
        limit: "8",
        lang: "en",
      }).toString();
      const data = await readJsonResponse(
        await fetch(url, {
          headers: { "User-Agent": userAgent },
          signal: AbortSignal.timeout(15000),
        }),
        2 * 1024 * 1024,
      );
      results = filterPhilippineResults(data);
      memorySearch.set(key, results);
      if (memorySearch.size > 100)
        memorySearch.delete(memorySearch.keys().next().value);
    }
    res.json({ results: results.map((r) => ({ ...r, token: sign(r) })) });
  } catch (e) {
    res.status(502).json({
      error:
        e.name === "TimeoutError"
          ? "Location search timed out. Please try again."
          : e.message,
    });
  }
});
mapRouter.get("/maps/default", async (_, res) => {
  try {
    res
      .set("Cache-Control", "no-store")
      .json(await getMapSnapshot("iloilo-default"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
mapRouter.post("/maps", json({ limit: "8kb" }), async (req, res) => {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const location = verify(req.body.token);
    const requested = req.body.view ?? {
      lat: location.lat,
      lon: location.lon,
      widthKm: 10,
    };
    const view = {
      lat: Number(requested.lat),
      lon: Number(requested.lon),
      widthKm: Number(requested.widthKm),
    };
    if (
      !Object.values(view).every(Number.isFinite) ||
      view.widthKm < 2 ||
      view.widthKm > 20 ||
      view.lat < 4 ||
      view.lat > 22 ||
      view.lon < 116 ||
      view.lon > 127
    )
      throw new Error(
        "Choose a view between 2 and 20 km wide within the Philippines.",
      );
    const distance = Math.hypot(
      (view.lon - location.lon) *
        111 *
        Math.cos((location.lat * Math.PI) / 180),
      (view.lat - location.lat) * 111,
    );
    if (distance > 30)
      throw new Error("Search for a new location to explore farther.");
    res
      .set("Cache-Control", "no-store")
      .json(await loadArea(location, view, controller.signal));
  } catch (e) {
    if (!res.destroyed)
      res.status(e.name === "AbortError" ? 499 : 400).json({
        error:
          e.name === "TimeoutError"
            ? "Map loading timed out. Please retry."
            : e.message,
      });
  }
});
