import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";

test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: { executablePath: process.env.CHROME_BIN || undefined },
});
const originalMap = JSON.parse(
  await fs.readFile(
    new URL("../src/data/default-map.json", import.meta.url),
    "utf8",
  ),
);
const map = {
  ...originalMap,
  districts: originalMap.districts.map((d) => ({
    ...d,
    roads: d.roads.slice(0, 10),
    buildings: [],
    lights: d.lights.slice(0, 8),
  })),
};

for (const preparing of [true, false]) {
  test(`cancel client export ${preparing ? "during browser check" : "during rendering"} and start again`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.route("**/api/maps/default", (route) =>
      route.fulfill({ json: map }),
    );
    if (preparing)
      await page.addInitScript(() => {
        const original = VideoEncoder.isConfigSupported.bind(VideoEncoder);
        VideoEncoder.isConfigSupported = async (config) => {
          await new Promise((resolve) => {
            window.releaseCodecCheck = resolve;
          });
          VideoEncoder.isConfigSupported = original;
          return original(config);
        };
      });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Play demo", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    await page.getByLabel("Export format").selectOption("webm");
    await page.getByLabel("Resolution", { exact: true }).selectOption("720");
    await page
      .getByRole("button", { name: "Create video", exact: true })
      .click();
    if (preparing) {
      await expect
        .poll(() => page.evaluate(() => typeof window.releaseCodecCheck))
        .toBe("function");
    } else {
      await expect
        .poll(() =>
          page
            .getByRole("progressbar", { name: "Video export progress" })
            .getAttribute("value"),
        )
        .not.toBe("0");
    }
    await page
      .getByRole("button", { name: "Cancel export", exact: true })
      .click();
    if (preparing) await page.evaluate(() => window.releaseCodecCheck());
    await expect(page.getByRole("dialog")).toContainText("Export cancelled", {
      timeout: 20000,
    });
    await expect(
      page.getByRole("link", { name: "Download video" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Create video", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel export", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page
      .getByRole("button", { name: "Export progress", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Cancel export", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Export cancelled", {
      timeout: 20000,
    });
  });
}
