import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getVideoMetadata, RenderInternals } from "@remotion/renderer";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const directory = await mkdtemp(path.join(tmpdir(), "export-colors-"));
const audio = await readFile(
  new URL("../public/after-hours.wav", import.meta.url),
);
const ffmpeg = RenderInternals.getExecutablePath({
  type: "ffmpeg",
  indent: false,
  logLevel: "error",
  binariesDirectory: null,
});

async function json(url, options) {
  const response = await fetch(`${base}${url}`, options);
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}

try {
  const map = await json("/api/maps/default");
  // Opposite colors expose dropped settings and reuse of a previous export.
  for (const lightColor of ["#ff00ff", "#00ffff"]) {
    const form = new FormData();
    form.append("audio", new Blob([audio]), "track.wav");
    form.append(
      "settings",
      JSON.stringify({
        mapId: map.id,
        theme: "christmas",
        colorMode: "custom",
        lightColor,
        duration: 0.2,
        intensity: 100,
        sensitivity: 100,
        zoom: 1,
        resolution: 720,
        enabled: map.districts.map((d) => d.name),
        labels: false,
        particles: false,
        envelopes: Array.from({ length: 6 }, () => [1, 1, 1]),
      }),
    );
    let job = await json("/api/exports", { method: "POST", body: form });
    const deadline = Date.now() + 180_000;
    while (job.status !== "done") {
      assert.notEqual(job.status, "failed", job.error);
      assert.ok(Date.now() < deadline, "Export timed out");
      await delay(500);
      job = await json(`/api/exports/${job.id}`);
    }
    const response = await fetch(`${base}/api/exports/${job.id}/download`);
    assert.ok(response.ok, "Video download failed");
    const file = path.join(directory, `${lightColor.slice(1)}.mp4`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    const metadata = await getVideoMetadata(file);
    assert.equal(metadata.codec, "h264");
    assert.equal(metadata.audioCodec, "aac");
    assert.equal(metadata.width, 1280);
    assert.equal(metadata.height, 720);
    const pixels = execFileSync(
      ffmpeg,
      [
        "-v",
        "error",
        "-ss",
        "0.067",
        "-i",
        file,
        "-frames:v",
        "1",
        "-c:v",
        "rawvideo",
        "-f",
        "image2pipe",
        "-pix_fmt",
        "rgb24",
        "pipe:1",
      ],
      { maxBuffer: 1280 * 720 * 3 + 1024 },
    );
    assert.equal(pixels.length, 1280 * 720 * 3);
    let matches = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      const [r, g, b] = pixels.subarray(i, i + 3);
      // Allow for H.264 compression, glow, and the dark map background.
      if (
        lightColor === "#ff00ff"
          ? r > 60 && b > 60 && r > g * 1.8 && b > g * 1.8
          : g > 60 && b > 60 && g > r * 1.8 && b > r * 1.8
      )
        matches++;
    }
    assert.ok(
      matches > 200,
      `Export lost ${lightColor}: only ${matches} matching pixels`,
    );
    console.log(
      `Verified ${lightColor} in decoded MP4: ${matches} matching pixels`,
    );
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
