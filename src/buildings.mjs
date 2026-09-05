export const buildingQuery = (bbox) =>
  `way[building][building!="no"](${bbox});relation[type=multipolygon][building][building!="no"](${bbox});`;

const same = (a, b) => a.lat === b.lat && a.lon === b.lon;
const valid = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);

// Members of a multipolygon can arrive in either direction and any order.
function ringsFrom(ways) {
  const pending = ways
    .map((w) => w.geometry)
    .filter((g) => g?.length > 1 && g.every(valid))
    .map((g) => [...g]);
  const rings = [];
  while (pending.length) {
    const ring = pending.pop();
    while (!same(ring[0], ring.at(-1))) {
      const index = pending.findIndex(
        (g) => same(ring.at(-1), g[0]) || same(ring.at(-1), g.at(-1)),
      );
      if (index === -1) break;
      const [next] = pending.splice(index, 1);
      if (!same(ring.at(-1), next[0])) next.reverse();
      ring.push(...next.slice(1));
    }
    if (ring.length >= 4 && same(ring[0], ring.at(-1))) rings.push(ring);
  }
  return rings;
}

// Clip filled polygons at the map boundary without closing open line fragments.
function clipRing(points) {
  let result = points;
  for (const [axis, edge, direction] of [
    [0, 0, 1],
    [0, 1600, -1],
    [1, 0, 1],
    [1, 900, -1],
  ]) {
    const input = result;
    result = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[(i + input.length - 1) % input.length],
        b = input[i];
      const aInside = (a[axis] - edge) * direction >= 0;
      const bInside = (b[axis] - edge) * direction >= 0;
      if (aInside !== bInside) {
        const t = (edge - a[axis]) / (b[axis] - a[axis]);
        result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
      if (bInside) result.push(b);
    }
  }
  return result;
}

export function addBuildings(osm, map) {
  const [west, south, east, north] = map.bounds;
  const project = ({ lon, lat }) => [
    ((lon - west) / (east - west)) * 1600,
    ((north - lat) / (north - south)) * 900,
  ];
  const districts = map.districts.map((d) => ({ ...d, buildings: [] }));
  let buildingCount = 0,
    pointCount = 0;
  const elements = (osm.elements ?? []).filter(
    (e) => e.tags?.building && e.tags.building !== "no",
  );
  const members = new Set();
  const add = (outer, inner = []) => {
    if (!outer.length || !districts.length || buildingCount >= 40000)
      return false;
    const count = [...outer, ...inner].reduce(
      (sum, ring) => sum + ring.length,
      0,
    );
    if (pointCount + count > 320000) return false;
    const clip = (rings) =>
      rings
        .map((ring) => clipRing(ring.map(project)))
        .filter(
          (ring) =>
            ring.length >= 3 &&
            Math.abs(
              ring.reduce((area, p, i) => {
                const q = ring[(i + 1) % ring.length];
                return area + p[0] * q[1] - q[0] * p[1];
              }, 0),
            ) > 0.02,
        );
    const outlines = clip(outer);
    if (!outlines.length) return false;
    const rings = [...outlines, ...clip(inner)];
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of outlines)
      for (const [x, y] of ring) {
        bounds[0] = Math.min(bounds[0], x);
        bounds[1] = Math.min(bounds[1], y);
        bounds[2] = Math.max(bounds[2], x);
        bounds[3] = Math.max(bounds[3], y);
      }
    const center = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    const distance = (d) =>
      Math.hypot(d.point[0] - center[0], d.point[1] - center[1]);
    const district = districts.reduce((a, b) =>
      distance(a) <= distance(b) ? a : b,
    );
    const d = rings
      .map(
        (ring) =>
          ring
            .map(
              (p, i) =>
                (i ? "L" : "M") +
                p.map((v) => Math.round(v * 10) / 10).join(","),
            )
            .join("") + "Z",
      )
      .join("");
    district.buildings.push({ d, bounds });
    buildingCount++;
    pointCount += count;
    return true;
  };
  for (const relation of elements.filter(
    (e) => e.type === "relation" && e.tags.type === "multipolygon",
  )) {
    const ways = (relation.members ?? []).filter((m) => m.type === "way");
    if (
      add(
        ringsFrom(ways.filter((m) => m.role === "outer" || !m.role)),
        ringsFrom(ways.filter((m) => m.role === "inner")),
      )
    ) {
      for (const member of ways) members.add(member.ref);
    }
  }
  for (const way of elements.filter(
    (e) => e.type === "way" && !members.has(e.id),
  )) {
    if (way.geometry?.every(valid)) add(ringsFrom([way]));
  }
  return { ...map, districts, buildingCount };
}
