import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const audio = await readFile(
  new URL("../public/after-hours.wav", import.meta.url),
);
const created = [];
async function json(url, options) {
  const response = await fetch(`${base}${url}`, options);
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
async function start(duration = 3) {
  const form = new FormData();
  form.append("audio", new Blob([audio]), "track.wav");
  form.append(
    "settings",
    JSON.stringify({
      mapId: "iloilo-default",
      theme: "midnight",
      colorMode: "custom",
      lightColor: "#ff00ff",
      duration,
      intensity: 100,
      sensitivity: 100,
      zoom: 1,
      resolution: 720,
      enabled: ["Jaro"],
      labels: false,
      particles: false,
      envelopes: Array.from({ length: Math.ceil(duration * 30) }, () => [
        1, 1, 1,
      ]),
    }),
  );
  const job = await json("/api/exports", { method: "POST", body: form });
  created.push(job.id);
  return job;
}
const cancel = (id) => json(`/api/exports/${id}/cancel`, { method: "POST" });
async function waitFor(id, predicate) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const job = await json(`/api/exports/${id}`);
    if (predicate(job)) return job;
    assert.notEqual(job.status, "failed", job.error);
    assert.ok(
      !["cancelled", "done"].includes(job.status),
      `Unexpected terminal state: ${job.status}`,
    );
    await delay(150);
  }
  throw new Error("Timed out waiting for export");
}
async function expectCancelled(id) {
  await waitFor(id, (j) => j.status === "cancelled");
  assert.equal((await cancel(id)).status, "cancelled");
  assert.equal((await fetch(`${base}/api/exports/${id}/download`)).status, 404);
  if (!process.env.TEST_BASE_URL) {
    for (const file of [`../exports/${id}.mp4`, `../.cache/audio/${id}.audio`])
      await assert.rejects(stat(new URL(file, import.meta.url)), {
        code: "ENOENT",
      });
  }
}
try {
  assert.equal(
    (await fetch(`${base}/api/exports/missing/cancel`, { method: "POST" }))
      .status,
    404,
  );
  const queued = await start();
  assert.equal((await cancel(queued.id)).status, "cancelling");
  await cancel(queued.id);
  await expectCancelled(queued.id);
  console.log(
    "Queued export cancelled; repeated cancellation and file cleanup passed.",
  );

  const rendering = await start();
  await waitFor(
    rendering.id,
    (j) => j.status === "rendering" && j.progress > 0,
  );
  await cancel(rendering.id);
  await expectCancelled(rendering.id);
  console.log("Active rendering cancelled; partial video and audio removed.");

  const next = await start(0.1);
  await waitFor(next.id, (j) => j.status === "done");
  assert.equal((await cancel(next.id)).status, "done");
  assert.equal(
    (await fetch(`${base}/api/exports/${next.id}/download`)).status,
    200,
  );
  console.log(
    "A new export completed after cancellation; finished downloads remain available.",
  );
} finally {
  for (const id of created) await cancel(id).catch(() => {});
}
