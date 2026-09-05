// Pure frame-based effects: seeking, preview, and MP4 rendering produce the same result.
export function districtPower(envelopes, frame, district, sensitivity) {
  const band = district % 3;
  let sum = 0,
    weight = 0;
  for (let offset = 0; offset < 8; offset++) {
    const sample = envelopes[frame - offset];
    if (!sample) continue;
    const w = 8 - offset;
    sum += (sample[band] ?? 0) * w;
    weight += w;
  }
  const energy = (weight ? sum / weight : 0) * (0.65 + sensitivity / 100);
  const threshold = 0.42 + (district % 4) * 0.075;
  const value = Math.max(0, Math.min(1, (energy - threshold + 0.12) / 0.24));
  return value * value * (3 - 2 * value);
}

export function snowflakeAt(index, frame, fps) {
  const depth = Math.floor(seeded(index * 13 + 1) * 3);
  const time = frame / fps;
  const wrap = (value, size) => ((value % size) + size) % size;
  return {
    x:
      wrap(
        seeded(index * 13 + 2) * 1640 +
          time * (4 + depth * 5) +
          Math.sin(time * (0.3 + seeded(index * 13 + 3) * 0.3) + index) *
            (12 + depth * 9),
        1640,
      ) - 20,
    y:
      wrap(
        seeded(index * 13 + 4) * 960 +
          time * (18 + depth * 16 + seeded(index * 13 + 5) * 15),
        960,
      ) - 30,
    radius: [3.5, 6, 10][depth] * (0.7 + seeded(index * 13 + 6) * 0.6),
    rotation:
      seeded(index * 13 + 7) * 360 + time * (seeded(index * 13 + 8) - 0.5) * 28,
    opacity: [0.35, 0.58, 0.78][depth],
  };
}

// Particles stay hidden until the music starts (frame 0) and then fade in
// gradually. Pure frame-based so preview seeks and MP4 renders match.
export const PARTICLE_FADE_SECONDS = 4;
export function particleVisibility(index, count, frame, fps) {
  const safeFps = fps > 0 ? fps : 30;
  const t = Math.max(0, frame / safeFps);
  const staggerWindow = 2.5;
  const fadeWindow = PARTICLE_FADE_SECONDS - staggerWindow;
  const delay = seeded(index * 31 + 7) * staggerWindow;
  const local = Math.max(0, Math.min(1, (t - delay) / fadeWindow));
  return local * local * (3 - 2 * local);
}

// One stable color per district when the user picks random lights.
export const RANDOM_LIGHT_COLORS = [
  "#e6c283",
  "#d77a70",
  "#85bc9c",
  "#9bbfc8",
  "#f2e7cd",
  "#7fc0a8",
  "#e09a5f",
];

export function themeLightColor(theme) {
  if (theme === "rain") return "#9bbfc8";
  if (theme === "moonlight") return "#b5d2e0";
  return "#e6c283";
}

export function isLightColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Single base color: the custom pick when requested, otherwise the theme.
export function baseLightColor(theme, colorMode, lightColor) {
  if (colorMode === "custom" && isLightColor(lightColor)) return lightColor;
  return themeLightColor(theme);
}

// Per-district light color. Random mode deals each district a stable palette
// color; christmas keeps its red/green pattern unless the user overrides it.
export function districtLightColor(index, theme, colorMode, lightColor) {
  if (colorMode === "random")
    return RANDOM_LIGHT_COLORS[index % RANDOM_LIGHT_COLORS.length];
  if (colorMode === "custom") return baseLightColor(theme, colorMode, lightColor);
  if (theme === "christmas") {
    if (index % 3 === 0) return "#d77a70";
    if (index % 3 === 1) return "#85bc9c";
  }
  return themeLightColor(theme);
}

function seeded(seed) {
  let value = Math.imul(seed + 1, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function raindropAt(index, frame, fps) {
  const time = frame / fps;
  const speed = 340 + seeded(index * 9 + 3) * 280;
  const length = 12 + seeded(index * 9 + 4) * 26;
  return {
    x: ((seeded(index * 9 + 1) * 1700 + time * speed * 0.18) % 1700) - 50,
    y: ((seeded(index * 9 + 2) * 1020 + time * speed) % 1020) - 60,
    length,
    width: 0.6 + seeded(index * 9 + 5) * 0.8,
    opacity: 0.16 + seeded(index * 9 + 6) * 0.28,
  };
}

// Six-fold crystalline symmetry, with a different branch pattern for each flake.
export function snowflakePath(index) {
  const branches = 1 + Math.floor(seeded(index * 7 + 9) * 3);
  const segments = [];
  const point = (x, y, angle) =>
    `${(x * Math.cos(angle) - y * Math.sin(angle)).toFixed(3)},${(x * Math.sin(angle) + y * Math.cos(angle)).toFixed(3)}`;
  for (let arm = 0; arm < 6; arm++) {
    const angle = (arm * Math.PI) / 3;
    segments.push(`M0,0L${point(0, -1, angle)}`);
    for (let branch = 0; branch < branches; branch++) {
      const distance = 0.35 + branch * 0.2;
      const length = 0.14 + seeded(index * 11 + branch + 3) * 0.18;
      segments.push(
        `M${point(-length, -distance - length, angle)}L${point(0, -distance, angle)}L${point(length, -distance - length, angle)}`,
      );
    }
  }
  return segments.join("");
}
