import { test, expect } from "@playwright/test";

test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: { executablePath: process.env.CHROME_BIN || undefined },
});

async function ready(page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await expect(page.locator("svg[data-map-id]")).toBeVisible();
}

async function snapshot(page) {
  return page.evaluate(() => {
    const audio = [...document.querySelectorAll("audio")].find(a => a.src);
    return {
      time: audio.currentTime,
      duration: audio.duration,
      paused: audio.paused,
      muted: audio.muted,
      position: Number(document.querySelector('[aria-label="Playback position"]').value) / 30,
      mapTime: Number(document.querySelector("svg[data-frame]").dataset.frame) / 30,
    };
  });
}

async function expectSynchronized(page) {
  await expect.poll(async () => {
    const state = await snapshot(page);
    return Math.max(Math.abs(state.time - state.position), Math.abs(state.time - state.mapTime));
  }).toBeLessThan(0.2);
}

test("rendering stalls do not rewind audio or leave the map behind", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.audioSeeks = [];
    const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      ...descriptor,
      set(value) {
        if (this.src) window.audioSeeks.push({ from: descriptor.get.call(this), to: value });
        descriptor.set.call(this, value);
      },
    });
  });
  await ready(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(1);
  await page.evaluate(() => {
    window.audioSeeks = [];
    window.audioStart = { time: document.querySelector("audio[src]").currentTime, wall: performance.now() };
    window.originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => window.originalRaf(timestamp => {
      // Simulate expensive map rendering / a busy mobile main thread.
      const until = performance.now() + 650;
      while (performance.now() < until) { /* deliberately stall rendering */ }
      callback(timestamp);
    });
  });
  await page.waitForTimeout(4500);
  const progressionError = await page.evaluate(() => {
    const elapsed = (performance.now() - window.audioStart.wall) / 1000;
    const advanced = document.querySelector("audio[src]").currentTime - window.audioStart.time;
    return Math.abs(elapsed - advanced);
  });
  // Visual updates cannot run during a blocked task. Audio must continue at
  // real time, with visuals catching up as soon as the main thread is released.
  expect(progressionError).toBeLessThan(0.25);
  expect(await page.evaluate(() => window.audioSeeks)).toEqual([]);
  await page.evaluate(() => { window.requestAnimationFrame = window.originalRaf; });
  await expectSynchronized(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect(errors).toEqual([]);
});

test("pause, scrubbing, mute, settings and looping share the audio clock", async ({ page }) => {
  await ready(page);
  const position = page.getByRole("slider", { name: "Playback position", exact: true });
  await position.fill("90");
  await expectSynchronized(page);
  expect((await snapshot(page)).time).toBeCloseTo(3, 1);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(3.3);
  await position.fill("240");
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(8);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  expect((await snapshot(page)).muted).toBe(true);
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  expect((await snapshot(page)).muted).toBe(false);
  await page.getByRole("button", { name: "Rain", exact: true }).click();
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("slider", { name: /Glow intensity/ }).fill("45");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  expect((await snapshot(page)).time).toBeGreaterThan(8);
  await expectSynchronized(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await snapshot(page);
  await page.waitForTimeout(350);
  expect((await snapshot(page)).time).toBe(paused.time);
  await position.fill("120");
  await expectSynchronized(page);
  expect((await snapshot(page)).time).toBeCloseTo(4, 1);
  expect((await snapshot(page)).paused).toBe(true);
  const max = Number(await position.getAttribute("max"));
  await position.fill(String(max - 9));
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeLessThan(2);
  await expectSynchronized(page);
  expect((await snapshot(page)).paused).toBe(false);
});

function wav(seconds) {
  const sampleRate = 8000;
  const count = sampleRate * seconds;
  const buffer = Buffer.alloc(44 + count * 2);
  buffer.write("RIFF"); buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) buffer.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / sampleRate) * 8000), 44 + i * 2);
  return buffer;
}

test("replacing a playing track leaves one paused source at the beginning", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(0.5);
  await page.locator('input[type="file"]').setInputFiles({ name: "replacement.wav", mimeType: "audio/wav", buffer: wav(3) });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await expect.poll(async () => (await snapshot(page)).duration).toBe(3);
  expect((await snapshot(page)).time).toBe(0);
  expect((await snapshot(page)).paused).toBe(true);
  await expectSynchronized(page);
  expect(await page.locator("audio[src]").count()).toBe(1);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).time).toBeGreaterThan(0.5);
  await expectSynchronized(page);
});

test("a delayed demo download cannot replace a user-selected track", async ({ page }) => {
  let releaseDemo;
  const pendingDemo = new Promise(resolve => { releaseDemo = resolve; });
  await page.route("**/after-hours.wav", async route => {
    await pendingDemo;
    await route.fulfill({ contentType: "audio/wav", body: wav(8) });
  });
  await page.goto("/");
  await expect(page.locator("svg[data-map-id]")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "my-track.wav", mimeType: "audio/wav", buffer: wav(3) });
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await expect.poll(async () => (await snapshot(page)).duration).toBe(3);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const demoResponse = page.waitForResponse("**/after-hours.wav");
  releaseDemo();
  await (await demoResponse).finished();
  await page.waitForTimeout(500);
  await expect(page.getByText("my-track", { exact: true })).toBeVisible();
  expect((await snapshot(page)).duration).toBe(3);
  expect((await snapshot(page)).paused).toBe(false);
});
