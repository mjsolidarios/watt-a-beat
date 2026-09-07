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
  id: "power-test",
  rivers: [],
  water: [],
  districts: [
    {
      name: "Test district",
      point: [800, 450],
      lights: [],
      roads: [
        { d: "M600 550 L1000 550", major: true, bounds: [600, 550, 1000, 550] },
      ],
      buildings: [
        { d: "M650 480 h60 v40 h-60 Z", bounds: [650, 480, 710, 520] },
      ],
    },
  ],
  roadCount: 1,
};
async function ready(page) {
  await page.route("**/api/maps/default", (r) => r.fulfill({ json: map }));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play demo", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Power", exact: true }).click();
}
async function streetPoint(page) {
  return page
    .locator('[data-district="Test district"] path[d="M600 550 L1000 550"]')
    .first()
    .evaluate((path) => {
      const p = path
        .getPointAtLength(path.getTotalLength() / 4)
        .matrixTransform(path.getScreenCTM());
      return { x: p.x, y: p.y };
    });
}
test("mouse clicks toggle district labels off and back on", async ({
  page,
}) => {
  await ready(page);
  const control = page.getByRole("button", {
    name: "Toggle power in Test district",
    exact: true,
  });
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-buildings="lit"]')).toHaveCount(0);
  await control.click();
  await expect(control).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-buildings="lit"]')).toHaveCount(1);
});
test("street taps toggle power without being treated as map drags", async ({
  page,
}) => {
  await ready(page);
  const p = await streetPoint(page);
  await page.mouse.click(p.x, p.y);
  const control = page.getByRole("button", {
    name: "Toggle power in Test district",
    exact: true,
  });
  await expect(control).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(p.x, p.y);
  await expect(control).toHaveAttribute("aria-pressed", "true");
});

test("dragging a street pans without toggling power; a small tap movement still toggles", async ({
  page,
}) => {
  await ready(page);
  const start = await streetPoint(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 80, start.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-district="Test district"]')).toHaveAttribute(
    "data-powered",
    "true",
  );
  const moved = await streetPoint(page);
  expect(moved.x - start.x).toBeCloseTo(80, 0);
  await page.mouse.move(moved.x, moved.y);
  await page.mouse.down();
  await page.mouse.move(moved.x + 2, moved.y + 2);
  await page.mouse.up();
  await expect(page.locator('[data-district="Test district"]')).toHaveAttribute(
    "data-powered",
    "false",
  );
  await expect(page.locator(".power-feedback")).toContainText(
    "Test district: power off",
  );
});

test.describe("touch controls", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("street and building taps toggle power with labels hidden", async ({
    page,
  }) => {
    await ready(page);
    await page
      .getByRole("button", { name: "Map settings", exact: true })
      .click();
    await page.getByRole("switch", { name: "Map labels", exact: true }).click();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    const p = await streetPoint(page);
    await page.touchscreen.tap(p.x, p.y);
    await expect(
      page.locator('[data-district="Test district"]'),
    ).toHaveAttribute("data-powered", "false");
    const building = await page
      .locator('[data-buildings="base"]')
      .evaluate((path) => {
        const box = path.getBBox();
        const point = new DOMPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ).matrixTransform(path.getScreenCTM());
        return { x: point.x, y: point.y };
      });
    await page.touchscreen.tap(building.x, building.y);
    await expect(
      page.locator('[data-district="Test district"]'),
    ).toHaveAttribute("data-powered", "true");
    await page.screenshot({ path: ".cache/power-mobile.png", fullPage: true });
  });
});
