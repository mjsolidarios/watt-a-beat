import { test, expect } from "@playwright/test";

// Run against the dev server with: npx playwright test tests/tooltips.spec.mjs
test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: { executablePath: process.env.CHROME_BIN || undefined },
});

async function expectInsideViewport(page) {
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
}

for (const width of [1440, 768, 390, 320]) {
  test(`labels stay within a ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Map settings", exact: true })).toBeVisible();
    for (const control of await page.locator("[data-tooltip]:visible").all()) {
      await control.hover();
      await expectInsideViewport(page);
      await expect(page.getByRole("tooltip")).toHaveText(await control.getAttribute("data-tooltip"));
      // The label remains readable when the pointer moves onto it.
      await page.getByRole("tooltip").hover();
      await expect(page.getByRole("tooltip")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("tooltip")).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("keyboard labels dismiss on Escape, resize, and control activation", async ({ page }) => {
  await page.goto("/");
  const settings = page.getByRole("button", { name: "Map settings", exact: true });
  await settings.focus();
  await expectInsideViewport(page);
  await expect(settings).toHaveAttribute("aria-describedby", await page.getByRole("tooltip").getAttribute("id"));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(settings).not.toHaveAttribute("aria-describedby");
  await settings.blur();
  await settings.focus();
  await expectInsideViewport(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await settings.click();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const dialog = page.locator("dialog[open]");
  // The dialog autofocuses Close. Tab away and back to exercise keyboard entry.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Close dialog" })).toBeFocused();
  await expectInsideViewport(page);
  expect(await page.getByRole("tooltip").evaluate(el => el.matches(":popover-open"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("touch controls do not leave hover labels on screen", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(process.env.TEST_BASE_URL || "http://127.0.0.1:3000");
  await page.getByRole("button", { name: "Christmas", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Christmas", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await context.close();
});
