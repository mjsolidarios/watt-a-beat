import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: { executablePath: process.env.CHROME_BIN || undefined },
  viewport: { width: 1440, height: 1000 },
});
const original = JSON.parse(
  await fs.readFile(
    new URL("../src/data/default-map.json", import.meta.url),
    "utf8",
  ),
);
const map = {
  ...original,
  rivers: [],
  water: [],
  districts: [
    {
      name: "West",
      point: [700, 400],
      roads: [],
      lights: [],
      buildings: [
        {
          d: "M680 470L720 470L720 510L680 510Z",
          bounds: [680, 470, 720, 510],
        },
      ],
    },
    {
      name: "East",
      point: [1000, 400],
      roads: [],
      lights: [],
      buildings: [
        {
          d: "M980 470L1020 470L1020 510L980 510Z",
          bounds: [980, 470, 1020, 510],
        },
      ],
    },
    { name: "Empty", point: [1100, 650], roads: [], lights: [], buildings: [] },
  ],
};
async function ready(page, data = map) {
  await page.route("**/api/maps/default", (r) => r.fulfill({ json: data }));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "3D buildings", exact: true }),
  ).toBeEnabled();
}
test("3D raises every visible district, skips offscreen buildings, and restores 2D", async ({
  page,
}) => {
  const data = structuredClone(map);
  data.districts[0].buildings.push({
    d: "M3000 470L3040 470L3040 510L3000 510Z",
    bounds: [3000, 470, 3040, 510],
  });
  await ready(page, data);
  const toggle = page.getByRole("button", {
    name: "3D buildings",
    exact: true,
  });
  await toggle.click();
  await expect(page.locator("[data-region-3d]")).toHaveCount(2);
  await expect(page.locator('[data-region-3d="West"]')).toHaveAttribute(
    "data-block-count",
    "1",
  );
  await expect(page.locator('[data-region-3d="East"]')).toHaveAttribute(
    "data-block-count",
    "1",
  );
  await expect(page.locator('[data-region-3d="Empty"]')).toHaveCount(0);
  await toggle.click();
  await expect(page.locator("[data-region-3d]")).toHaveCount(0);
  await expect(page.locator('[data-buildings="lit"]')).toHaveCount(3);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
test("areas without footprints show a useful empty state", async ({ page }) => {
  await ready(page, {
    ...map,
    districts: map.districts.map((d) => ({ ...d, buildings: [] })),
  });
  await page.getByRole("button", { name: "3D buildings", exact: true }).click();
  await expect(page.locator(".region-3d-hint")).toContainText(
    "No building footprints",
  );
  await expect(page.locator("[data-block-face]")).toHaveCount(0);
});
test("raised buildings switch power by tapping their faces and lights react during music", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "3D buildings", exact: true }).click();
  await page.getByRole("button", { name: "Power", exact: true }).click();
  const west = page.locator('[data-region-3d="West"]');
  const roof = west.locator('[data-block-face="roof"]');
  await roof.click();
  await expect(west.locator("[data-block-light]")).toHaveCount(0);
  await expect(
    page.locator('[data-region-3d="East"] [data-block-light="windows"]'),
  ).toHaveCount(1);
  await expect(west).toHaveAttribute("data-powered", "false");
  await roof.click();
  await expect(west.locator('[data-block-light="windows"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  const lights = west.locator("[data-block-lights]");
  const before = await lights.getAttribute("opacity");
  await expect.poll(() => lights.getAttribute("opacity")).not.toBe(before);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: ".cache/region-3d-fixture.png" });
});
test("dense loaded districts animate and mobile controls fit the viewport", async ({
  page,
}) => {
  await ready(page, original);
  await page.getByRole("button", { name: "3D buildings", exact: true }).click();
  expect(await page.locator("[data-region-3d]").count()).toBeGreaterThan(1);
  const count = await page
    .locator("[data-region-3d]")
    .evaluateAll((elements) =>
      elements.reduce((sum, e) => sum + Number(e.dataset.blockCount), 0),
    );
  expect(count).toBeGreaterThan(10000);
  await page.getByRole("button", { name: "Play demo", exact: true }).click();
  const before = await page
    .locator("svg[data-frame]")
    .getAttribute("data-frame");
  await expect
    .poll(() => page.locator("svg[data-frame]").getAttribute("data-frame"))
    .not.toBe(before);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.mouse.move(700, 100);
  await page.screenshot({ path: ".cache/region-3d-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Power", exact: true }).click();
  await page.screenshot({
    path: ".cache/region-3d-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const toggle = await page
    .getByRole("button", { name: "3D buildings", exact: true })
    .boundingBox();
  expect(toggle.x + toggle.width).toBeLessThanOrEqual(390);
});
