import { test, expect } from "@playwright/test";
import fs from "node:fs";

test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: {
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
  },
});
const map = JSON.parse(fs.readFileSync("src/data/default-map.json", "utf8"));
map.districts = map.districts
  .slice(0, 2)
  .map((d) => ({ ...d, roads: d.roads.slice(0, 30), buildings: [] }));
test.setTimeout(90000);
function wav(seconds, frequency = 440) {
  const rate = 8000,
    n = Math.round(rate * seconds),
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
      Math.round(Math.sin((i / rate) * Math.PI * frequency * 2) * 12000),
      44 + i * 2,
    );
  return b;
}
const file = (name, seconds = 8) => ({
  name,
  mimeType: "audio/wav",
  buffer: wav(seconds),
});
async function ready(page, videoDuration = 12) {
  await page.route("**/api/maps/default", (r) => r.fulfill({ json: map }));
  await page.route("https://i.ytimg.com/**", (r) => r.fulfill({ status: 204 }));
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
    window.YT = {Player: class {
      constructor(el, options) {
        this.el=el; this.options=options; this.time=0; this.state=5; this.volume=100; this.muted=false;
        window.testPlayer=this; el.textContent='YouTube test video';
        this.timer=setInterval(() => {
          if(this.state===1 && this.time>=${videoDuration}) {this.time=${videoDuration};this.emit(0);}
        },50);
        setTimeout(()=>options.events.onReady({target:this}),20);
      }
      get time() {return Math.min(${videoDuration}, this.position + (this.state===1 ? (performance.now()-this.anchor)/1000 : 0));}
      set time(value) {this.position=value;this.anchor=performance.now();}
      emit(state) {this.time=this.time;this.state=state;this.options.events.onStateChange({target:this,data:state});}
      getDuration(){return ${videoDuration};} getVideoData(){return {title:'City music', author:'Test channel'};}
      getCurrentTime(){return this.time;} getPlayerState(){return this.state;}
      playVideo(){if(this.time>=${videoDuration})this.time=0;if(this.state!==1)this.emit(1);}
      pauseVideo(){if(this.state!==2)this.emit(2);}
      seekTo(t){this.time=t;if(this.state===0)this.emit(2);}
      mute(){this.muted=true;} unMute(){this.muted=false;} setVolume(v){this.volume=v;} setSize(){}
      destroy(){clearInterval(this.timer);this.el.remove();}
    }};window.onYouTubeIframeAPIReady();
  `,
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
}
async function addYoutube(page) {
  await page.getByRole("button", { name: "Paste YouTube URL" }).click();
  await page
    .getByRole("textbox", { name: "YouTube video URL" })
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(page.getByText("Ready to play", { exact: true })).toBeVisible();
}
async function snapshot(page) {
  return page.evaluate(() => ({
    audioTime: document.querySelector("audio").currentTime,
    paused: document.querySelector("audio").paused,
    duration: document.querySelector("audio").duration,
    videoTime: window.testPlayer?.time,
    videoState: window.testPlayer?.state,
    frame:
      +document.querySelector('[aria-label="Playback position"]').value / 30,
  }));
}

test("multiple uploads form one mix; additive uploads, removal and logo follow playback", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page
    .locator("input[type=file]")
    .setInputFiles([file("Bass.wav", 4), file("Melody.wav", 8)]);
  await expect(
    page.getByText("2 sources · Your mix", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await snapshot(page)).duration)
    .toBeCloseTo(8, 1);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".brand-symbol")).toHaveClass(/is-playing/);
  await expect
    .poll(async () => (await snapshot(page)).audioTime)
    .toBeGreaterThan(0.3);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator(".brand-symbol")).not.toHaveClass(/is-playing/);
  await page.locator("input[type=file]").setInputFiles(file("Rain.wav", 5));
  await expect(
    page.getByText("3 sources · Your mix", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Your mix · 3 sources/ }).click();
  await expect(page.locator('[aria-label="Mix sources"]')).toBeVisible();
  await page
    .getByRole("button", { name: "Remove Melody", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove Bass", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => (await snapshot(page)).duration)
    .toBeCloseTo(5, 1);
  await page.getByRole("slider", { name: "Audio volume" }).fill("35");
  expect(await page.locator("audio").evaluate((a) => a.volume)).toBe(0.35);
  await page.getByRole("button", { name: "Play mix", exact: true }).click();
  await expect(page.locator(".brand-symbol")).toHaveClass(/is-playing/);
  await page.screenshot({ path: "test-results/music-mixer-desktop.png" });
  await page.getByRole("button", { name: "Pause mix", exact: true }).click();
  await page.getByRole("button", { name: "Remove Bass", exact: true }).click();
  await page.getByRole("button", { name: "Remove Rain", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Play mix", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("YouTube and local files share play, pause, seek, buffering, volumes and full-mix looping", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page, 10);
  await page
    .locator("input[type=file]")
    .setInputFiles([file("Bass.wav", 3), file("Melody.wav", 6)]);
  await expect(
    page.getByText("2 sources · Your mix", { exact: true }),
  ).toBeVisible();
  await addYoutube(page);
  await expect(
    page.getByText("3 sources · Your mix", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).audioTime)
    .toBeGreaterThan(0.4);
  expect((await snapshot(page)).videoState).toBe(1);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("90");
  await expect
    .poll(async () =>
      Math.abs(
        (await snapshot(page)).audioTime - (await snapshot(page)).videoTime,
      ),
    )
    .toBeLessThan(0.3);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  expect((await snapshot(page)).videoState).toBe(2);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.evaluate(() => window.testPlayer.emit(3));
  await expect(page.locator(".brand-symbol")).not.toHaveClass(/is-playing/);
  expect((await snapshot(page)).paused).toBe(true);
  await page.evaluate(() => window.testPlayer.emit(1));
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("240");
  await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
  expect((await snapshot(page)).videoState).toBe(1);
  await page.evaluate(() => {
    window.testPlayer.time = 10;
    window.testPlayer.emit(0);
  });
  await expect
    .poll(async () => (await snapshot(page)).audioTime)
    .toBeLessThan(2);
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  expect(
    await page.evaluate(
      () => window.testPlayer.muted && document.querySelector("audio").muted,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /Your mix · 3 sources/ }).click();
  await page.getByRole("slider", { name: "YouTube video 1 volume" }).fill("25");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  expect(await page.evaluate(() => window.testPlayer.volume)).toBe(25);
  // Audio added after a video remains additive too.
  await page.locator("input[type=file]").setInputFiles(file("Rain.wav", 12));
  await expect(
    page.getByText("4 sources · Your mix", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await page.evaluate(() => window.testPlayer.emit(3));
  await expect(page.locator(".brand-symbol")).not.toHaveClass(/is-playing/);
  expect((await snapshot(page)).videoState).toBe(3);
  await page.evaluate(() => window.testPlayer.emit(1));
  await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("330");
  await expect
    .poll(async () => (await snapshot(page)).audioTime)
    .toBeGreaterThan(11);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("0");
  await expect
    .poll(async () => (await snapshot(page)).videoTime)
    .toBeLessThan(2);
  await page.getByRole("button", { name: /Your mix · 4 sources/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove YouTube video 1", exact: true })
    .click();
  await expect(page.locator(".youtube-source")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("failed batch preserves the existing mix; mobile dialog fits; reduced motion keeps a steady glow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await page
    .locator("input[type=file]")
    .setInputFiles([file("Bass.wav"), file("Melody.wav")]);
  await expect(
    page.getByText("2 sources · Your mix", { exact: true }),
  ).toBeVisible();
  await page.locator("input[type=file]").setInputFiles([
    file("Rain.wav"),
    {
      name: "broken.mp3",
      mimeType: "audio/mpeg",
      buffer: Buffer.from("invalid"),
    },
  ]);
  await expect(
    page.getByRole("alert").filter({ hasText: "broken.mp3" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Your mix · 2 sources/ }).click();
  await expect(
    page.getByRole("button", { name: "Remove Rain", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Play mix", exact: true }).click();
  await expect(page.locator(".brand-symbol")).toHaveClass(/is-playing/);
  expect(
    await page
      .locator(".brand-logo")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".brand-logo")
      .evaluate((e) => getComputedStyle(e).filter),
  ).not.toBe("none");
  const box = await page.locator("dialog").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/music-mixer-mobile.png" });
});

test("a shorter YouTube source finishes without stopping audio and rejoins the next loop", async ({
  page,
}) => {
  await ready(page, 1);
  await page.locator("input[type=file]").setInputFiles(file("Longer.wav", 3));
  await expect(page.getByText("Longer", { exact: true })).toBeVisible();
  await addYoutube(page);
  // A paused seek must stay paused, but an immediate Play must still work.
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("6");
  expect((await snapshot(page)).paused).toBe(true);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).audioTime)
    .toBeGreaterThan(1.2);
  expect((await snapshot(page)).paused).toBe(false);
  await expect.poll(async () => (await snapshot(page)).videoState).toBe(0);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("81");
  await expect
    .poll(async () => (await snapshot(page)).audioTime)
    .toBeLessThan(1);
  await expect.poll(async () => (await snapshot(page)).videoState).toBe(1);
  await expect(page.locator(".brand-symbol")).toHaveClass(/is-playing/);
});

test("a video failure retains playable local audio and rejecting nine files preserves the mix", async ({
  page,
}) => {
  await ready(page);
  await page.locator("input[type=file]").setInputFiles(file("Keep.wav"));
  await expect(page.getByText("Keep", { exact: true })).toBeVisible();
  await addYoutube(page);
  await page.evaluate(() =>
    window.testPlayer.options.events.onError({ data: 150 }),
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "embedded players" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () => (await snapshot(page)).audioTime)
    .toBeGreaterThan(0.3);
  await page
    .locator("input[type=file]")
    .setInputFiles(
      Array.from({ length: 9 }, (_, i) => file(`Extra ${i}.wav`, 1)),
    );
  await expect(
    page.getByRole("alert").filter({ hasText: "up to 8" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Your mix · 2 sources/ }).click();
  await expect(
    page.getByRole("button", { name: "Remove Keep", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove Extra 0", exact: true }),
  ).toHaveCount(0);
});
