import { test, expect } from "@playwright/test";

test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: { executablePath: process.env.CHROME_BIN || undefined },
});

test("buildings follow district power and custom colors in the preview and export request", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Play", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("svg[data-building-count]")).toHaveAttribute(
    "data-building-count",
    "35229",
  );
  await expect(page.locator('[data-buildings="base"]')).toHaveCount(7);
  expect(
    await page
      .locator('[data-buildings="base"]')
      .evaluateAll((nodes) =>
        nodes.every((n) => n.getAttribute("d").length > 0),
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Custom light color", { exact: true }).fill("#ff00ff");
  for (const roof of await page.locator('[data-buildings="lit"]').all()) {
    await expect(roof).toHaveAttribute("fill", "#ff00ff");
  }
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(async () =>
      page
        .locator("[data-district]")
        .evaluateAll((nodes) =>
          nodes.some((n) => Number(n.getAttribute("data-power")) > 0.1),
        ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const districts = await page.locator("[data-district]").evaluateAll((nodes) =>
    nodes.map((n) => ({
      power: Number(n.getAttribute("data-power")),
      roof: Number(
        n.querySelector('[data-buildings="lit"]').getAttribute("fill-opacity"),
      ),
    })),
  );
  for (const d of districts) expect(d.roof).toBeCloseTo(d.power * 0.55, 3);
  await page.screenshot({
    path: "/tmp/watt-buildings-preview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Map settings", exact: true }).click();
  await page
    .getByRole("button", { name: "Cut all power", exact: true })
    .click();
  await expect(page.locator('[data-buildings="lit"]')).toHaveCount(0);
  await expect(page.locator('[data-buildings="base"]')).toHaveCount(7);
  await page
    .getByRole("button", { name: "Reconnect all", exact: true })
    .click();
  await expect(page.locator('[data-buildings="lit"]')).toHaveCount(7);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();

  let settings;
  await page.route("**/api/exports", async (route) => {
    const body = route.request().postDataBuffer().toString();
    settings = JSON.parse(body.match(/name="settings"\r\n\r\n([^\r\n]+)/)[1]);
    await route.fulfill({
      json: { id: "color-test", status: "done", progress: 1 },
    });
  });
  await page.getByRole("button", { name: "Export video", exact: true }).click();
  await page
    .locator("dialog[open]")
    .getByRole("button", { name: "Export video", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Download video" }),
  ).toBeVisible();
  expect(settings.colorMode).toBe("custom");
  expect(settings.lightColor).toBe("#ff00ff");
  expect(settings.mapId).toBe("iloilo-default");
  expect(settings.enabled).toHaveLength(7);
  expect(errors).toEqual([]);
});
