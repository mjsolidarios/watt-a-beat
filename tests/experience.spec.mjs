import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { Input, BufferSource, ALL_FORMATS } from "mediabunny";

test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: { executablePath: process.env.CHROME_BIN || undefined },
  viewport: { width: 1440, height: 1000 },
});

const originalMap = JSON.parse(
  await fs.readFile(
    new URL("../src/data/default-map.json", import.meta.url),
    "utf8",
  ),
);
const map = {
  ...originalMap,
  id: "test-iloilo",
  location: { ...originalMap.location, token: "test-location" },
};
function wav(seconds = 1) {
  const rate = 16000,
    n = rate * seconds,
    b = Buffer.alloc(44 + n * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 440 * 2) * 14000),
      44 + i * 2,
    );
  return b;
}
async function ready(page, data = map) {
  await page.route("**/api/maps/default", (route) =>
    route.fulfill({ json: data }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play demo", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("svg[data-map-id]")).toBeVisible();
}
async function mockYoutube(page) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
    window.YT = {PlayerState: {PLAYING: 1, PAUSED: 2}, Player: class {
      constructor(element, options) {
        this.options = options; this.state = 2; window.testPlayer = this;
        element.textContent = 'YouTube player preview';
        this.element = element;
        setTimeout(() => options.events.onReady({target: this}), 30);
      }
      getDuration() {return 24;} getVideoData() {return {title:'City music',author:'Test channel'};}
      getPlayerState() {return this.state;} getCurrentTime() {return 0;}
      playVideo() {this.state=1;this.options.events.onStateChange({data:1,target:this});}
      pauseVideo() {this.state=2;this.options.events.onStateChange({data:2,target:this});}
      mute() {} unMute() {} setVolume() {} seekTo() {}
      destroy() { this.element.remove(); }
    }};
    window.onYouTubeIframeAPIReady();
  `,
    }),
  );
  await page.route("https://i.ytimg.com/**", (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
}

test("starting choices and YouTube status, validation, retry and demo recovery", async ({
  page,
}) => {
  await mockYoutube(page);
  await ready(page);
  await page.screenshot({ path: "/tmp/watt-desktop.png" });
  let choosers = 0;
  page.on("filechooser", () => choosers++);
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Paste YouTube URL" }).click();
  const input = page.getByRole("textbox", { name: "YouTube video URL" });
  await expect(input).toBeFocused();
  await input.fill("https://example.com/watch?v=dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Enter a valid YouTube URL",
  );
  await input.fill("https://youtu.be/dQw4w9WgXcQ");
  await input.press("Enter");
  const source = page.getByRole("complementary", { name: "YouTube video" });
  await expect(source).toContainText("City music");
  await expect(source).toContainText("Ready to play");
  await expect(source).toContainText("Simulated rhythm");
  await page.screenshot({ path: "/tmp/watt-desktop-youtube.png" });
  await page.evaluate(() =>
    window.testPlayer.options.events.onError({ data: 150 }),
  );
  await expect(source.getByRole("alert")).toContainText("embedded players");
  await source.getByRole("button", { name: "Retry video" }).click();
  await expect(source).toContainText("Ready to play");
  await expect(source.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "YouTube video exports are silent",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  await expect(source).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  expect(choosers).toBe(0);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload audio", exact: true }).click();
  await chooser;
  expect(choosers).toBe(1);
});

test("Surprise changes place and style; Undo restores visual settings and preserves audio", async ({
  page,
}) => {
  await ready(page);
  await page.route("**/api/locations?*", (route) =>
    route.fulfill({ json: { results: [{ ...map.location, name: "Baguio" }] } }),
  );
  await page.route("**/api/maps", (route) =>
    route.fulfill({ json: { ...map, id: "test-baguio", name: "Baguio" } }),
  );
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  const audio = await page.locator("audio[src]").getAttribute("src");
  await page.getByRole("button", { name: "Surprise me" }).click();
  await expect(page.locator("svg[data-map-id]")).toHaveAttribute(
    "data-map-id",
    "test-baguio",
  );
  await expect(
    page.getByRole("button", { name: "City lights", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("svg[data-map-id]")).toHaveAttribute(
    "data-map-id",
    "test-iloilo",
  );
  await expect(
    page.getByRole("button", { name: "City lights", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("audio[src]")).toHaveAttribute("src", audio);
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await page.route("**/api/locations?*", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Search unavailable. Try again." },
    }),
  );
  await page.getByRole("button", { name: "Surprise me" }).click();
  await expect(page.getByRole("alert")).toContainText("Search unavailable");
  await expect(page.locator("svg[data-map-id]")).toHaveAttribute(
    "data-map-id",
    "test-iloilo",
  );
});

test("district ripple, focus and power work while paused and from keyboard", async ({
  page,
}) => {
  await ready(page);
  const district = page.getByRole("button", {
    name: "Ripple in Mandurriao",
    exact: true,
  });
  await district.click();
  await expect(page.getByTestId("district-ripple")).toBeVisible();
  await page.getByRole("button", { name: "Power", exact: true }).click();
  const power = page.getByRole("button", {
    name: "Toggle power in Mandurriao",
    exact: true,
  });
  await power.focus();
  await page.keyboard.press("Enter");
  await expect(power).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-district="Mandurriao"]')).toHaveAttribute(
    "data-power",
    "0.000",
  );
  await power.press("Space");
  await expect(power).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Focus", exact: true }).click();
  await page
    .getByRole("button", { name: "Focus Mandurriao", exact: true })
    .click();
  await expect(page.locator('[data-district="Jaro"]')).toHaveAttribute(
    "opacity",
    "0.32",
  );
});

test("mobile starting controls, URL input and export dialog fit the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByRole("button", { name: "Paste YouTube URL" }).click();
  await expect(
    page.getByRole("textbox", { name: "YouTube video URL" }),
  ).toBeFocused();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/watt-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create video", exact: true }),
  ).toBeVisible();
});

for (const format of ["webm", "mp4"])
  test(`client renderer creates a playable ${format} with audio and animated map frames; cancellation creates no download`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    const miniMap = {
      ...map,
      districts: map.districts.map((d) => ({
        ...d,
        roads: d.roads.slice(0, 10),
        buildings: [
          {
            d: "M680 470L720 470L720 510L680 510Z",
            bounds: [680, 470, 720, 510],
          },
        ],
        lights: d.lights.slice(0, 8),
      })),
    };
    await ready(page, miniMap);
    await page
      .getByRole("button", { name: "3D buildings", exact: true })
      .click();
    await expect(page.locator("[data-region-3d]")).toHaveCount(
      miniMap.districts.length,
    );
    await page.getByRole("button", { name: "Rain", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "one-second.wav",
      mimeType: "audio/wav",
      buffer: wav(),
    });
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
    let serverExportCalls = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/exports")) serverExportCalls++;
    });
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    await page.getByLabel("Resolution", { exact: true }).selectOption("720");
    await page.getByLabel("Export format").selectOption(format);
    await page
      .getByRole("button", { name: "Create video", exact: true })
      .click();
    const downloadLink = page.getByRole("link", {
      name: "Download video",
      exact: true,
    });
    await expect(downloadLink).toBeVisible({ timeout: 120000 });
    const downloadPromise = page.waitForEvent("download");
    await downloadLink.click();
    const download = await downloadPromise;
    const path = testInfo.outputPath(`rendered.${format}`);
    await download.saveAs(path);
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BufferSource(await fs.readFile(path)),
    });
    try {
      expect(await input.computeDuration()).toBeCloseTo(1, 1);
      const video = await input.getPrimaryVideoTrack();
      expect(video.displayWidth).toBe(1280);
      expect(video.displayHeight).toBe(720);
      expect(await input.getPrimaryAudioTrack()).not.toBeNull();
    } finally {
      input.dispose();
    }
    const url = await downloadLink.getAttribute("href");
    const image = await page.evaluate(async (url) => {
      const video = document.createElement("video");
      video.src = url;
      video.muted = true;
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;
      });
      video.currentTime = 0.2;
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });
      await video.play();
      await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
      video.pause();
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const data = ctx.getImageData(0, 0, 1280, 720).data;
      const colors = new Set();
      for (let i = 0; i < data.length; i += 40)
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      const firstPng = canvas.toDataURL();
      // This pixel lies on a raised roof above the original footprint.
      const roofPixel = Array.from(ctx.getImageData(552, 364, 1, 1).data);
      video.currentTime = 0.7;
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });
      await video.play();
      await new Promise((resolve) => video.requestVideoFrameCallback(resolve));
      video.pause();
      ctx.drawImage(video, 0, 0);
      return {
        colors: colors.size,
        firstPng,
        png: canvas.toDataURL(),
        roofPixel,
      };
    }, url);
    await fs.writeFile(
      "/tmp/watt-export-frame.png",
      Buffer.from(image.png.split(",")[1], "base64"),
    );
    expect(image.colors).toBeGreaterThan(30);
    expect(image.roofPixel[0]).toBeGreaterThan(45);
    expect(image.roofPixel[1]).toBeGreaterThan(55);
    expect(image.png).not.toBe(image.firstPng);
    await page
      .getByRole("button", { name: "Create another video", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel export", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Export cancelled", {
      timeout: 20000,
    });
    await expect(downloadLink).toHaveCount(0);
    expect(serverExportCalls).toBe(0);
  });
