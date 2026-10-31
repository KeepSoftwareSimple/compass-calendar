import { expect, test } from "@playwright/test";
import {
  installParityWebEnvironment,
  prepareParityDemoWeek,
} from "../parity/seed-demo-fixture.util";

const HORIZONTAL_TOLERANCE_PX = 32;
const MAX_BOTTOM_GAP_PX = 40;
const MIN_BOTTOM_GAP_PX = 16;

type BannerLayout = {
  horizontalDelta: number;
  bottomGap: number;
};

const readUpNextBannerLayout = async (
  page: import("@playwright/test").Page,
): Promise<BannerLayout | null> =>
  page.evaluate(() => {
    const grid = document.getElementById("mainGrid");
    const banner = document.querySelector("[data-up-next-banner]");
    if (!(grid instanceof HTMLElement) || !(banner instanceof HTMLElement)) {
      return null;
    }
    const gridRect = grid.getBoundingClientRect();
    const bannerRect = banner.getBoundingClientRect();
    const gridCenterX = gridRect.left + gridRect.width / 2;
    const bannerCenterX = bannerRect.left + bannerRect.width / 2;
    return {
      horizontalDelta: Math.abs(gridCenterX - bannerCenterX),
      bottomGap: window.innerHeight - bannerRect.bottom,
    };
  });

const assertUpNextBannerLayout = async (
  page: import("@playwright/test").Page,
) => {
  await expect(page.locator("[data-up-next-banner]")).toBeVisible({
    timeout: 15_000,
  });
  const layout = await readUpNextBannerLayout(page);
  expect(layout).not.toBeNull();
  if (!layout) return;
  expect(layout.horizontalDelta).toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
  expect(layout.bottomGap).toBeGreaterThanOrEqual(MIN_BOTTOM_GAP_PX);
  expect(layout.bottomGap).toBeLessThanOrEqual(MAX_BOTTOM_GAP_PX);
};

test.describe("up next banner layout", () => {
  test.beforeEach(async ({ page }) => {
    await installParityWebEnvironment(page);
  });

  for (const viewport of [
    { width: 1280, height: 1000 },
    { width: 360, height: 800 },
  ] as const) {
    for (const path of ["/week", "/day"] as const) {
      test(`centers over the grid near the bottom at ${viewport.width}px in ${path}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 1000 });
        await prepareParityDemoWeek(page);
        if (path === "/day") {
          await page.goto("/day", { waitUntil: "domcontentloaded" });
          await page.locator("#mainGrid").waitFor({ timeout: 20_000 });
        }
        await page.setViewportSize(viewport);
        await page.evaluate(() => {
          window.dispatchEvent(new Event("resize"));
        });
        await page.locator("#mainGrid").waitFor({ timeout: 20_000 });
        await expect
          .poll(
            async () => (await readUpNextBannerLayout(page))?.horizontalDelta,
            {
              timeout: 5_000,
            },
          )
          .toBeLessThanOrEqual(HORIZONTAL_TOLERANCE_PX);
        await assertUpNextBannerLayout(page);
      });
    }
  }
});
