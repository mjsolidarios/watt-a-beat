import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: {
    executablePath: process.env.CHROME_BIN || "/usr/bin/google-chrome",
  },
});
test.setTimeout(60000);
const map = JSON.parse(fs.readFileSync("src/data/default-map.json", "utf8"));
map.districts = map.districts.slice(0, 2).map((d) => ({
  ...d,
  roads: d.roads.slice(0, 20),
  buildings: [],
  lights: d.lights.slice(0, 12),
}));
const ids = ["dQw4w9WgXcQ", "M7lc1UVf-VE", "jNQXAC9IVRw"];
async function ready(page, durations = [8, 12, 16]) {
  await page.route("**/api/maps/default", (r) => r.fulfill({ json: map }));
  await page.route("https://www.youtube.com/iframe_api", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `
    window.testPlayers=[];window.readyDelay=20;
    window.YT={Player:class {
      constructor(el,options){
        this.el=el;this.options=options;this.videoId=options.videoId;this.index=window.testPlayers.length;
        this.duration=${JSON.stringify(durations)}[${JSON.stringify(ids)}.indexOf(this.videoId)]||10;
        this.state=5;this.time=0;this.volume=100;this.muted=false;this.destroyed=false;
        window.testPlayers.push(this);this.el.textContent='Embedded video '+(this.index+1);
        this.timer=setInterval(()=>{if(this.state===1&&this.time>=this.duration)this.emit(0);},25);
        setTimeout(()=>options.events.onReady({target:this}),window.readyDelay);
      }
      get time(){return Math.min(this.duration,this.position+(this.state===1?(performance.now()-this.anchor)/1000:0));}
      set time(t){this.position=t;this.anchor=performance.now();}
      emit(state){this.time=this.time;this.state=state;setTimeout(()=>{if(!this.destroyed)this.options.events.onStateChange({target:this,data:state});},0);}
      getCurrentTime(){return this.time;}getDuration(){return this.duration;}getPlayerState(){return this.state;}
      getVideoData(){return {title:'Video '+(this.index+1),author:'Test channel'};}
      playVideo(){if(this.state===1)return;if(this.time>=this.duration)this.time=0;this.emit(1);}
      pauseVideo(){if(this.state!==2)this.emit(2);}
      seekTo(t){this.time=t;if(this.state===0)this.emit(2);}
      setVolume(v){this.volume=v;}mute(){this.muted=true;}unMute(){this.muted=false;}
      destroy(){this.destroyed=true;clearInterval(this.timer);this.el.remove();}
    }};window.onYouTubeIframeAPIReady();
  `,
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled({ timeout: 20000 });
}
async function add(page, id, wait = true) {
  await page.getByRole("button", { name: "Paste YouTube URL" }).click();
  await page
    .getByRole("textbox", { name: "YouTube video URL" })
    .fill("https://youtu.be/" + id);
  await page.getByRole("button", { name: "Load", exact: true }).click();
  if (wait)
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeEnabled();
}
const states = (page) =>
  page.evaluate(() =>
    window.testPlayers
      .filter((p) => !p.destroyed)
      .map((p) => ({
        state: p.state,
        time: p.time,
        volume: p.volume,
        muted: p.muted,
        index: p.index,
      })),
  );
const mix = (page) => page.getByRole("button", { name: /Your mix ·/ });
const mainPlay = (page) =>
  page.getByRole("button", { name: "Play", exact: true });

test("multiple YouTube videos coexist with local music, independent volume, seek and removal", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page
    .locator("input[type=file]")
    .setInputFiles("public/after-hours.wav");
  await expect(mainPlay(page)).toBeEnabled();
  await add(page, ids[0]);
  await add(page, ids[1]);
  await expect(page.locator(".youtube-video-host")).toHaveCount(2);
  await expect(
    page.getByText("3 sources · Your mix", { exact: true }),
  ).toBeVisible();
  await mainPlay(page).click();
  await expect
    .poll(async () => (await states(page)).every((p) => p.state === 1))
    .toBe(true);
  await expect
    .poll(() => page.locator("audio").evaluate((a) => a.paused))
    .toBe(false);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("90");
  await expect
    .poll(async () => {
      const players = await states(page);
      const time = await page.locator("audio").evaluate((a) => a.currentTime);
      return Math.max(...players.map((p) => Math.abs(p.time - time)));
    })
    .toBeLessThan(0.4);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect
    .poll(async () => (await states(page)).every((p) => p.state === 2))
    .toBe(true);
  await mix(page).click();
  await page
    .getByRole("slider", { name: "YouTube video 1 volume", exact: true })
    .fill("20");
  await page
    .getByRole("slider", { name: "YouTube video 2 volume", exact: true })
    .fill("65");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await expect
    .poll(async () => (await states(page)).every((p) => p.muted))
    .toBe(true);
  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  expect((await states(page)).map((p) => p.volume)).toEqual([20, 65]);
  await add(page, ids[2]);
  await expect(page.locator(".youtube-video-host")).toHaveCount(3);
  expect((await states(page)).map((p) => p.index)).toEqual([0, 1, 2]);
  await mainPlay(page).click({ trial: true });
  await page.screenshot({ path: "test-results/multiple-youtube-previews.png" });
  await mix(page).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove YouTube video 2", exact: true })
    .click();
  expect((await states(page)).map((p) => p.index)).toEqual([0, 2]);
  await page.getByRole("button", { name: "Play mix", exact: true }).click();
  await expect
    .poll(async () => (await states(page)).every((p) => p.state === 1))
    .toBe(true);
  await expect(page.locator(".brand-symbol")).toHaveClass(/is-playing/);
  await page.screenshot({ path: "test-results/multiple-youtube-mixer.png" });
  expect(errors).toEqual([]);
});

test("YouTube-only mix coordinates buffering, iframe pause and end-of-mix looping", async ({
  page,
}) => {
  await ready(page, [2, 6, 10]);
  await add(page, ids[0]);
  await add(page, ids[1]);
  await mainPlay(page).click();
  await expect
    .poll(async () => (await states(page)).every((p) => p.state === 1))
    .toBe(true);
  await page.evaluate(() => window.testPlayers[0].emit(3));
  await expect.poll(async () => (await states(page))[1].state).toBe(2);
  await expect(page.locator(".brand-symbol")).not.toHaveClass(/is-playing/);
  await page.evaluate(() => window.testPlayers[0].emit(1));
  await expect
    .poll(async () => (await states(page)).every((p) => p.state === 1))
    .toBe(true);
  await page.evaluate(() => window.testPlayers[0].pauseVideo());
  await expect
    .poll(async () => (await states(page)).every((p) => p.state === 2))
    .toBe(true);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("30");
  await mainPlay(page).click();
  await expect
    .poll(async () => (await states(page)).every((p) => p.state === 1))
    .toBe(true);
  await page
    .getByRole("slider", { name: "Playback position", exact: true })
    .fill("120");
  await expect
    .poll(async () => (await states(page))[1].time)
    .toBeGreaterThan(4);
  expect((await states(page))[0].state).not.toBe(1);
  await page.evaluate(() => {
    window.testPlayers[1].time = 6;
    window.testPlayers[1].emit(0);
  });
  await expect
    .poll(async () =>
      (await states(page)).every((p) => p.time < 2 && p.state === 1),
    )
    .toBe(true);
  await expect(page.locator(".brand-symbol")).toHaveClass(/is-playing/);
});

test("failure, retry, removal during loading and mute affect only the chosen video", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await add(page, ids[0]);
  await add(page, ids[1]);
  await page.evaluate(() =>
    window.testPlayers[1].options.events.onError({ data: 150 }),
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "embedded players" }),
  ).toBeVisible();
  expect((await states(page)).map((p) => p.index)).toEqual([0]);
  await mainPlay(page).click();
  await expect.poll(async () => (await states(page))[0].state).toBe(1);
  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry video 2", exact: true })
    .click();
  await expect(mainPlay(page)).toBeEnabled();
  expect((await states(page)).map((p) => p.index)).toEqual([0, 2]);
  expect((await states(page)).every((p) => p.muted)).toBe(true);
  await page.evaluate(() => (window.readyDelay = 1000));
  await add(page, ids[2], false);
  await expect(page.locator(".youtube-video-host")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Remove YouTube video 3", exact: true })
    .click();
  await expect(mainPlay(page)).toBeEnabled();
  await page.waitForTimeout(1100);
  await expect(page.locator(".youtube-video-host")).toHaveCount(2);
  expect((await states(page)).map((p) => p.index)).toEqual([0, 2]);
  expect(errors).toEqual([]);
});

test("adding eight videos preserves all sources and the mobile preview stays within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  for (let i = 0; i < 8; i++) await add(page, ids[i % 3]);
  await expect(page.locator(".youtube-video-host")).toHaveCount(8);
  await add(page, ids[0], false);
  await expect(
    page.getByRole("alert").filter({ hasText: "up to 8 YouTube videos" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".youtube-video-host")).toHaveCount(8);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const panel = await page.locator(".youtube-collection").boundingBox();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Compact video previews" }).click();
  expect(
    await page
      .locator(".youtube-video-host")
      .first()
      .evaluate((el) => el.clientHeight),
  ).toBeLessThan(200);
  expect(
    await page
      .locator(".youtube-video-host")
      .first()
      .evaluate((el) => el.clientHeight),
  ).toBeGreaterThanOrEqual(100);
  await page.screenshot({
    path: "test-results/multiple-youtube-mobile.png",
    fullPage: true,
  });
});
