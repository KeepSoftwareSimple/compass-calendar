import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

const artifactDir = "/opt/cursor/artifacts";

test.describe("contextual nudge captures", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  for (const viewport of [
    { width: 1280, height: 900, suffix: "1280" },
    { width: 360, height: 740, suffix: "360" },
  ]) {
    test(`recurrence scope prompt at ${viewport.suffix}px`, async ({
      page,
    }) => {
      test.skip(process.env.NUDGE_CAPTURE !== "1", "Set NUDGE_CAPTURE=1");

      await page.setViewportSize(viewport);
      await page.goto("/week", { waitUntil: "networkidle" });

      await page.evaluate(() => {
        window.__compassE2E?.showRecurrenceScopeCaptureToast?.();
      });

      await expect(page.getByText("Apply to series?")).toBeVisible({
        timeout: 30_000,
      });
      await expect(
        page.getByRole("button", { name: "Following" }),
      ).toBeVisible();

      await page.screenshot({
        path: `${artifactDir}/recurrence-scope-prompt-${viewport.suffix}.png`,
        fullPage: false,
      });
    });
  }
});
