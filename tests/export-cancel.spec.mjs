import { test, expect } from "@playwright/test";

test.use({
  baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:3000",
  launchOptions: { executablePath: process.env.CHROME_BIN || undefined },
});

for (const duringUpload of [false, true]) {
  test(`cancel export ${duringUpload ? "during upload" : "while rendering"} and start again`, async ({
    page,
  }) => {
    let releaseUpload;
    const uploadGate = new Promise((resolve) => {
      releaseUpload = resolve;
    });
    let status = "rendering",
      posts = 0,
      cancels = 0;
    await page.route("**/api/exports", async (route) => {
      posts++;
      if (duringUpload && posts === 1) await uploadGate;
      await route.fulfill({
        json: { id: `job-${posts}`, status: "queued", progress: 0 },
      });
    });
    await page.route("**/api/exports/job-*", (route) =>
      route.fulfill({ json: { id: `job-${posts}`, status, progress: 0.1 } }),
    );
    await page.route("**/api/exports/job-*/cancel", async (route) => {
      cancels++;
      status = "cancelled";
      await route.fulfill({
        status: 202,
        json: { id: `job-${posts}`, status: "cancelling", progress: 0.1 },
      });
    });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Export video", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    const dialog = page.locator("dialog[open]");
    await dialog
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    if (!duringUpload)
      await expect(
        page.getByText("Rendering video…", { exact: true }),
      ).toBeVisible();
    await page
      .getByRole("button", { name: "Cancel export", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancelling…", exact: true }),
    ).toBeDisabled();
    if (duringUpload) {
      expect(cancels).toBe(0);
      releaseUpload();
    }
    await expect(
      page.getByText("Export cancelled. You can start another video.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(cancels).toBe(1);
    await expect(
      page.getByRole("link", { name: "Download video" }),
    ).toHaveCount(0);
    status = "rendering";
    await dialog
      .getByRole("button", { name: "Export video", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Cancel export", exact: true }),
    ).toBeEnabled();
    await expect.poll(() => posts).toBe(2);
  });
}
