export const VIEW_WIDTH = 1600,
  VIEW_HEIGHT = 900;
export function geographicBounds({ lat, lon, widthKm }) {
  const dx = widthKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const dy = (widthKm * 9) / 16 / 111.32;
  return [lon - dx / 2, lat - dy / 2, lon + dx / 2, lat + dy / 2];
}
export function nextView(map, zoom, pan) {
  const [west, south, east, north] = map.bounds;
  return {
    lat: map.view.lat + (pan.y / zoom / 900) * (north - south),
    lon: map.view.lon - (pan.x / zoom / 1600) * (east - west),
    widthKm: Math.max(2, Math.min(20, map.view.widthKm / zoom)),
  };
}
export function visibleBounds(zoom, pan) {
  return [
    800 + (-800 - pan.x) / zoom,
    450 + (-450 - pan.y) / zoom,
    800 + (800 - pan.x) / zoom,
    450 + (450 - pan.y) / zoom,
  ];
}
export function intersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}
export function pointVisible(p, b) {
  return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
}
// Liang–Barsky clipping discards geometry outside the loaded rectangle.
export function clipSegment(a, b, rect = [0, 0, 1600, 900]) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  let low = 0,
    high = 1;
  const p = [-dx, dx, -dy, dy],
    q = [a[0] - rect[0], rect[2] - a[0], a[1] - rect[1], rect[3] - a[1]];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) low = Math.max(low, t);
      else high = Math.min(high, t);
      if (low > high) return null;
    }
  }
  return [
    [a[0] + low * dx, a[1] + low * dy],
    [a[0] + high * dx, a[1] + high * dy],
  ].map(([x, y]) => [
    Math.max(rect[0], Math.min(rect[2], x)),
    Math.max(rect[1], Math.min(rect[3], y)),
  ]);
}
function clippedLines(points) {
  const lines = [];
  let current = [];
  for (let i = 1; i < points.length; i++) {
    const clipped = clipSegment(points[i - 1], points[i]);
    if (!clipped) {
      if (current.length) lines.push(current);
      current = [];
      continue;
    }
    if (
      current.length &&
      Math.hypot(
        current.at(-1)[0] - clipped[0][0],
        current.at(-1)[1] - clipped[0][1],
      ) > 0.1
    ) {
      lines.push(current);
      current = [];
    }
    if (!current.length) current.push(clipped[0]);
    current.push(clipped[1]);
  }
  if (current.length) lines.push(current);
  return lines;
}
const svgPath = (points) =>
  points
    .map(
      (p, i) =>
        (i ? "L" : "M") + p.map((v) => Math.round(v * 10) / 10).join(","),
    )
    .join("");
const boundsOf = (points) => [
  Math.min(...points.map((p) => p[0])),
  Math.min(...points.map((p) => p[1])),
  Math.max(...points.map((p) => p[0])),
  Math.max(...points.map((p) => p[1])),
];
function stitch(ways) {
  const pending = ways
    .map((w) => w.geometry)
    .filter((g) => g?.length > 1)
    .map((g) => [...g]);
  const key = (p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
  const chains = [];
  while (pending.length) {
    let chain = pending.pop(),
      changed = true;
    while (changed) {
      changed = false;
      for (let i = pending.length - 1; i >= 0; i--) {
        const g = pending[i];
        if (key(chain.at(-1)) === key(g[0])) {
          chain.push(...g.slice(1));
          pending.splice(i, 1);
          changed = true;
        } else if (key(g.at(-1)) === key(chain[0])) {
          chain.unshift(...g.slice(0, -1));
          pending.splice(i, 1);
          changed = true;
        }
      }
    }
    chains.push(chain);
  }
  return chains;
}
// OSM coastline direction has land on its left (counterclockwise in screen space).
function coastPolygon(line) {
  const first = line[0],
    last = line.at(-1);
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.2)
    return svgPath(line) + "Z";
  const perimeter = 5000;
  const along = (p) =>
    Math.abs(p[1]) < 0.1
      ? p[0]
      : Math.abs(p[0] - 1600) < 0.1
        ? 1600 + p[1]
        : Math.abs(p[1] - 900) < 0.1
          ? 4100 - p[0]
          : 5000 - p[1];
  const onEdge = (p) =>
    p[0] < 0.1 || p[1] < 0.1 || p[0] > 1599.9 || p[1] > 899.9;
  if (!onEdge(first) || !onEdge(last)) return "";
  const end = along(last),
    start = along(first),
    distance = (end - start + perimeter) % perimeter;
  const corners = [
    [0, [0, 0]],
    [1600, [1600, 0]],
    [2500, [1600, 900]],
    [4100, [0, 900]],
  ];
  const between = corners
    .map(([at, p]) => ({ distance: (end - at + perimeter) % perimeter, p }))
    .filter((c) => c.distance > 0.1 && c.distance < distance)
    .sort((a, b) => a.distance - b.distance);
  return svgPath([...line, ...between.map((c) => c.p), first]) + "Z";
}
export function buildArea(osm, location, view, knownZones = []) {
  const bounds = geographicBounds(view),
    [west, south, east, north] = bounds;
  const project = ({ lon, lat }) => [
    ((lon - west) / (east - west)) * 1600,
    ((north - lat) / (north - south)) * 900,
  ];
  const elements = osm.elements ?? [];
  let candidates = knownZones.length
    ? knownZones
    : elements
        .filter(
          (e) =>
            e.type === "node" &&
            e.tags?.name &&
            [
              "suburb",
              "quarter",
              "neighbourhood",
              "town",
              "village",
              "city",
            ].includes(e.tags.place),
        )
        .map((e) => ({ name: e.tags.name, lat: e.lat, lon: e.lon }));
  candidates = candidates
    .map((c) => ({ ...c, point: project(c) }))
    .filter((c) =>
      pointVisible(
        c.point,
        knownZones.length ? [0, 0, 1600, 900] : [80, 65, 1520, 835],
      ),
    );
  // Spatially separate labels rather than drawing a pile of adjacent barangay names.
  const chosen = [];
  for (const candidate of candidates.sort(
    (a, b) =>
      Math.hypot(a.point[0] - 800, a.point[1] - 450) -
      Math.hypot(b.point[0] - 800, b.point[1] - 450),
  )) {
    if (
      (knownZones.length ||
        chosen.every(
          (c) =>
            Math.hypot(
              c.point[0] - candidate.point[0],
              c.point[1] - candidate.point[1],
            ) > 210,
        )) &&
      !chosen.some((c) => c.name === candidate.name)
    )
      chosen.push(candidate);
    if (chosen.length === 7) break;
  }
  if (!chosen.length) chosen.push({ name: location.name, point: [800, 450] });
  const districts = chosen.map((c) => ({
    name: c.name,
    point: c.point.map(Math.round),
    roads: [],
    lights: [],
  }));
  let pointBudget = 220000,
    lightCount = 0,
    roadCount = 0;
  for (const way of elements
    .filter((e) => e.tags?.highway && e.geometry)
    .sort(
      (a, b) =>
        Number(/primary|secondary|tertiary|trunk/.test(b.tags.highway)) -
        Number(/primary|secondary|tertiary|trunk/.test(a.tags.highway)),
    )) {
    if (pointBudget <= 0 || roadCount >= 14000) break;
    const major = /primary|secondary|tertiary|trunk/.test(way.tags.highway);
    const points = way.geometry
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
      .slice(0, pointBudget)
      .map(project);
    pointBudget -= points.length;
    for (const line of clippedLines(points)) {
      if (roadCount >= 14000) break;
      const mid = line[Math.floor(line.length / 2)];
      const zone = districts.reduce((a, b) =>
        Math.hypot(a.point[0] - mid[0], a.point[1] - mid[1]) <
        Math.hypot(b.point[0] - mid[0], b.point[1] - mid[1])
          ? a
          : b,
      );
      zone.roads.push({ d: svgPath(line), major, bounds: boundsOf(line) });
      roadCount++;
      if (lightCount < 2200 && (major || way.id % 4 === 0))
        for (
          let i = 1;
          i < line.length && lightCount < 2200;
          i += major ? 2 : 4
        ) {
          zone.lights.push([
            ...line[i].map((v) => Math.round(v * 10) / 10),
            (way.id + i) % 17,
          ]);
          lightCount++;
        }
    }
  }
  const coastline = stitch(
    elements.filter((e) => e.tags?.natural === "coastline"),
  );
  const coastalLines = coastline.flatMap((c) => clippedLines(c.map(project)));
  const land = coastalLines.length
    ? coastalLines.map(coastPolygon).join("")
    : "M0,0H1600V900H0Z";
  const rivers = elements
    .filter((e) => e.geometry && e.tags?.waterway)
    .flatMap((e) =>
      clippedLines(e.geometry.map(project)).map((line) => ({
        d: svgPath(line),
        wide: e.tags.waterway === "river",
        bounds: boundsOf(line),
      })),
    );
  const water = elements
    .filter(
      (e) =>
        e.geometry && e.tags?.natural === "water" && e.geometry.length < 12000,
    )
    .map((e) => ({
      d: svgPath(e.geometry.map(project)) + "Z",
      bounds: boundsOf(e.geometry.map(project)),
    }));
  return {
    id: "",
    name: location.name,
    description: location.description ?? "",
    location,
    view,
    bounds,
    districts,
    land,
    coast: coastalLines.map(svgPath).join(""),
    rivers,
    water,
    roadCount,
    source: "© OpenStreetMap contributors, ODbL",
    retrieved: new Date().toISOString().slice(0, 10),
  };
}
