// A fixed oblique projection keeps building bases anchored to the flat map.
// Heights are illustrative: the cached footprints do not contain survey heights.
const point = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
const polygon = (vertices) => `M${vertices.map(point).join("L")}Z`;

// Consecutive depth-sorted buildings share path nodes. Larger batches cut DOM
// size; the 3–8px typical height keeps painter errors below a pixel at map scale.
export const BLOCK_BATCH_SIZE = 128;
// Horizontal shift per unit height. 0.5 (about 27° from vertical) pulled roofs
// off the 1–3px footprints that dominate the map. A quarter-height shift still
// shows the east wall without the city looking sheared northwest.
export const BLOCK_EXTRUDE_SHEAR = 0.25;

export function footprintRings(path) {
  if (typeof path !== "string" || /[^MLZ\d.,\s+\-eE]/.test(path)) return [];
  return (path.match(/M[^M]+/gi) ?? []).flatMap((part) => {
    const values =
      part.match(/[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
    if (
      values.length < 6 ||
      values.length % 2 ||
      values.some((v) => !Number.isFinite(v))
    )
      return [];
    const ring = [];
    for (let i = 0; i < values.length; i += 2) {
      const p = [values[i], values[i + 1]];
      if (!ring.length || p[0] !== ring.at(-1)[0] || p[1] !== ring.at(-1)[1])
        ring.push(p);
    }
    if (
      ring.length > 1 &&
      ring[0][0] === ring.at(-1)[0] &&
      ring[0][1] === ring.at(-1)[1]
    )
      ring.pop();
    return ring.length >= 3 ? [ring] : [];
  });
}

export function extrudeBuilding(building) {
  const rings = footprintRings(building.d);
  const [x0, y0, x1, y1] = building.bounds;
  if (
    !rings.length ||
    ![x0, y0, x1, y1].every(Number.isFinite) ||
    x1 <= x0 ||
    y1 <= y0
  )
    return null;
  const size = Math.sqrt((x1 - x0) * (y1 - y0));
  const variation = Math.abs(Math.sin(x0 * 0.17 + y0 * 0.31));
  const height = Math.min(26, Math.max(3, size * 0.6 + 2 + variation * 3));
  const lift = [-height * BLOCK_EXTRUDE_SHEAR, -height];
  const roofPoint = (p) => [p[0] + lift[0], p[1] + lift[1]];
  let left = "",
    front = "",
    windows = "";
  for (const ring of rings) {
    const signedArea = ring.reduce((sum, p, i) => {
      const q = ring[(i + 1) % ring.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      // Only the south/east-facing sides are visible from this projection.
      const orientation = signedArea >= 0 ? 1 : -1;
      const nx = dy * orientation,
        ny = -dx * orientation;
      if (nx * BLOCK_EXTRUDE_SHEAR + ny <= 0) continue;
      const wall = polygon([a, b, roofPoint(b), roofPoint(a)]);
      if (nx > ny) left += wall;
      else front += wall;
      const length = Math.hypot(dx, dy);
      // Most footprints are 1–3px; window bands on those walls are subpixel.
      const floors =
        height >= 6 && length >= 3
          ? Math.min(2, Math.max(1, Math.floor(height / 5)))
          : 0;
      for (let floor = 1; floor <= floors; floor++) {
        const t = floor / (floors + 1);
        const inset = Math.min(0.25, 0.7 / length);
        const start = [
          a[0] + dx * inset + lift[0] * t,
          a[1] + dy * inset + lift[1] * t,
        ];
        const end = [
          b[0] - dx * inset + lift[0] * t,
          b[1] - dy * inset + lift[1] * t,
        ];
        windows += `M${point(start)}L${point(end)}`;
      }
    }
  }
  return {
    left,
    front,
    roof: rings.map((r) => polygon(r.map(roofPoint))).join(""),
    windows,
    height,
    depth: y1 + x1 * BLOCK_EXTRUDE_SHEAR,
  };
}

// Map footprints are immutable. Weak keys release geometry when a loaded map
// is discarded, while pan/zoom can reuse projection and window calculations.
const extrusionCache = new WeakMap();
function cachedExtrusion(building) {
  if (!extrusionCache.has(building))
    extrusionCache.set(building, extrudeBuilding(building));
  return extrusionCache.get(building);
}

export function buildingBlockBatches(buildings) {
  const blocks = buildings
    .map(cachedExtrusion)
    .filter(Boolean)
    .sort((a, b) => a.depth - b.depth);
  const batches = [];
  // Batch nearby buildings so a dense district stays a few hundred SVG nodes.
  for (let i = 0; i < blocks.length; i += BLOCK_BATCH_SIZE) {
    const group = blocks.slice(i, i + BLOCK_BATCH_SIZE);
    batches.push({
      count: group.length,
      left: group.map((b) => b.left).join(""),
      front: group.map((b) => b.front).join(""),
      roof: group.map((b) => b.roof).join(""),
      windows: group.map((b) => b.windows).join(""),
    });
  }
  return batches;
}
