import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:3000");
  assert.match(await page.title(), /Watt a Beat/);
  await page.getByRole("link", { name: "Watt a Beat home" }).waitFor();
  await page.locator('[data-map-id="iloilo-default"]').waitFor();
  const search = page.getByRole("combobox", {
    name: "Search Philippine locations",
  });
  await search.fill("Cebu City");
  await search.press("Enter");
  await page.getByRole("option").first().waitFor({ timeout: 25000 });
  console.log(
    "Search results:",
    await page.getByRole("option").allTextContents(),
  );
  await page.screenshot({ path: "/tmp/brownout-location-search.png" });
  await page
    .getByRole("option")
    .filter({ has: page.locator("strong", { hasText: /^Cebu City$/ }) })
    .first()
    .click();
  await page.locator('[data-map-name="Cebu City"]').waitFor({ timeout: 90000 });
  assert.equal(await page.locator("[data-map-id]").count(), 1);
  assert.equal(await page.locator('[data-map-id="iloilo-default"]').count(), 0);
  assert.equal(
    await page.getByRole("button", { name: /back to iloilo/i }).count(),
    0,
  );
  const firstId = await page
    .locator("[data-map-id]")
    .getAttribute("data-map-id");
  console.log(
    "Cebu loaded:",
    firstId,
    "roads:",
    await page.locator("[data-map-id]").getAttribute("data-road-count"),
  );
  await page.getByRole("button", { name: "Rain Rain over the city" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector(".timecode")?.textContent?.startsWith("00:02"),
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: "/tmp/brownout-cebu-desktop.png" });
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.waitForFunction(
    (id) =>
      document.querySelector("[data-map-id]")?.getAttribute("data-map-id") !==
      id,
    firstId,
    { timeout: 90000 },
  );
  assert.equal(await page.locator("[data-map-id]").count(), 1);
  console.log(
    "Zoom replaced map:",
    await page.locator("[data-map-id]").getAttribute("data-map-id"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/brownout-cebu-mobile.png" });
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight,
    ),
    false,
  );
  const chooser = page.waitForEvent("filechooser");
  await page.locator(".map-upload").click();
  await (await chooser).setFiles("/tmp/afterlight-test.wav");
  await page.waitForFunction(
    () =>
      document.querySelector(".track-details strong")?.textContent ===
      "afterlight-test",
  );
  await page.getByRole("button", { name: "Export video" }).click();
  await page.getByLabel("Resolution", { exact: true }).selectOption("720");
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/exports") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Render video", exact: true }).click();
  const response = await responsePromise,
    job = await response.json();
  assert.ok(response.ok(), JSON.stringify(job));
  console.log("Selected-area video:", job.id);
  await page
    .getByRole("link", { name: "Download video" })
    .waitFor({ timeout: 180000 });
  const download = await page.request.get(
    `http://127.0.0.1:3000/api/exports/${job.id}/download`,
  );
  assert.match(
    download.headers()["content-disposition"],
    /watt-a-beat-rain\.mp4/,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Philippine search, area replacement, viewport reload, mobile layout and selected-area MP4 passed.",
  );
} finally {
  await browser.close();
}
