import { expect, test } from "@playwright/test";
import { prepareCalendarPage } from "../utils/event-test-utils";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-31";
const FIXTURE_KEY = "compass.overlap-screenshot.fixture";
const LEGACY_DECK_KEY = "compass.overlap-screenshot.legacy-deck";

async function prepareOverlapScreenshotPage(
  page: import("@playwright/test").Page,
  {
    fixture,
    legacyDeck,
  }: {
    fixture: "tyler-legacy" | "tyler";
    legacyDeck: boolean;
  },
) {
  await page.addInitScript(
    ({ denverZone, fixtureValue, legacyDeckValue, fixtureKey, legacyKey }) => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem("compass.view.sidebar-open", "false");
      localStorage.setItem("compass.timezone.default", denverZone);
      localStorage.setItem(fixtureKey, fixtureValue);
      if (legacyDeckValue) {
        localStorage.setItem(legacyKey, "1");
      } else {
        localStorage.removeItem(legacyKey);
      }
    },
    {
      denverZone: DENVER,
      fixtureKey: FIXTURE_KEY,
      fixtureValue: fixture,
      legacyDeckValue: legacyDeck,
      legacyKey: LEGACY_DECK_KEY,
    },
  );
  await page.clock.install({ time: new Date("2026-10-31T12:00:00-06:00") });
  await prepareCalendarPage(page);
  await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
  await page.locator("#mainGrid").waitFor({ state: "visible" });
  await expect(
    page.getByRole("button", { name: /monthly ritual/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("button", { name: /Calendar timezone:/i }),
  ).toContainText("MDT", { timeout: 10_000 });
  await page.evaluate(() => {
    const grid = document.querySelector("#weekGridScroller");
    if (grid instanceof HTMLElement) {
      grid.scrollTop = 17 * 60;
    }
  });
}

test.describe("timed overlap deck screenshot", () => {
  test.use({
    timezoneId: "UTC",
    viewport: { width: 1600, height: 800 },
  });

  test("capture before (pre-4905 deck, legacy fixture)", async ({ page }) => {
    await prepareOverlapScreenshotPage(page, {
      fixture: "tyler-legacy",
      legacyDeck: true,
    });

    const output =
      process.env.OVERLAP_SCREENSHOT_PATH ??
      "/opt/cursor/artifacts/overlap-before-v2.png";

    await page.locator("#mainSection").screenshot({ path: output });
  });

  test("capture after (current deck, normalized fixture)", async ({ page }) => {
    await prepareOverlapScreenshotPage(page, {
      fixture: "tyler",
      legacyDeck: false,
    });

    const output =
      process.env.OVERLAP_SCREENSHOT_PATH ??
      "/opt/cursor/artifacts/overlap-after-v2.png";

    await page.locator("#mainSection").screenshot({ path: output });
  });
});
