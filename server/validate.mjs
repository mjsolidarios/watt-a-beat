const names = [
  "Jaro",
  "La Paz",
  "Mandurriao",
  "Molo",
  "Arevalo",
  "City Proper",
  "Lapuz",
];
export function validateSettings(s, mapData) {
  if (!s || typeof s !== "object") throw new Error("Missing video settings.");
  const number = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (!["midnight", "christmas", "moonlight", "rain"].includes(s.theme))
    throw new Error("Invalid atmosphere.");
  const colorMode =
    s.colorMode === undefined || s.colorMode === null
      ? "theme"
      : s.colorMode;
  if (!["theme", "custom", "random"].includes(colorMode))
    throw new Error("Invalid light color mode.");
  const lightColor =
    typeof s.lightColor === "string" && /^#[0-9a-fA-F]{6}$/.test(s.lightColor)
      ? s.lightColor
      : "#e6c283";
  if (
    !number(s.duration, 0.1, 300) ||
    !number(s.intensity, 0, 100) ||
    !number(s.sensitivity, 0, 100) ||
    !number(s.zoom, 0.8, 2.2)
  )
    throw new Error("Invalid video settings.");
  if (![720, 1080].includes(s.resolution))
    throw new Error("Invalid resolution.");
  const allowedNames = mapData ? mapData.districts.map((d) => d.name) : names;
  if (
    !Array.isArray(s.enabled) ||
    !s.enabled.every((n) => allowedNames.includes(n))
  )
    throw new Error("Invalid lighting areas.");
  if (s.pan && (!number(s.pan.x, -900, 900) || !number(s.pan.y, -650, 650)))
    throw new Error("Invalid map position.");
  if (
    !Array.isArray(s.envelopes) ||
    s.envelopes.length > 9001 ||
    s.envelopes.length < Math.ceil(s.duration * 30) ||
    !s.envelopes.every(
      (r) =>
        Array.isArray(r) && r.length === 3 && r.every((v) => number(v, 0, 1)),
    )
  )
    throw new Error("Invalid audio analysis.");
  return {
    theme: s.theme,
    colorMode,
    lightColor,
    duration: s.duration,
    intensity: s.intensity,
    sensitivity: s.sensitivity,
    zoom: s.zoom,
    enabled: [...new Set(s.enabled)],
    labels: !!s.labels,
    particles: !!s.particles,
    pan: s.pan ? { x: s.pan.x, y: s.pan.y } : { x: 0, y: 0 },
    selected: null,
    envelopes: s.envelopes,
    resolution: s.resolution,
  };
}
