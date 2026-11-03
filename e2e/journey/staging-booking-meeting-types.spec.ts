import { expect, type Page, test } from "@playwright/test";
import { isJourneyEnabled } from "./journey-leg.util";

/*
 * Read-only meeting-type legs against the staging public booking page. Nothing
 * here signs in, saves, or books, so no synthetic data is left behind.
 */

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });

/** A staging host with two or more meeting types, set as a repo variable. */
const typesSlug = process.env.STAGING_BOOKING_MEETING_TYPES_SLUG?.trim() ?? "";

const typeButtons = (page: Page) => page.locator("button[data-meeting-type]");

test.beforeEach(() => {
  test.skip(
    !isJourneyEnabled("STAGING"),
    "Set STAGING_JOURNEY_ENABLED=1 to run against staging",
  );
});

test("a ?type= link to a missing page shows not found", async ({ page }) => {
  const slug = `compass-e2e-missing-${Date.now().toString(36)}`;
  await page.goto(`/meet/${slug}?type=type-deep`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Meeting page not found" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(typeButtons(page)).toHaveCount(0);
});

test("an unknown ?type= falls back to type #1 and keys switch in place", async ({
  page,
}) => {
  test.skip(
    typesSlug === "",
    "Set STAGING_BOOKING_MEETING_TYPES_SLUG to a staging host with 2+ types",
  );

  await page.goto(`/meet/${typesSlug}?type=compass-e2e-gone`, {
    waitUntil: "domcontentloaded",
  });
  const buttons = typeButtons(page);
  await expect(buttons.first()).toBeVisible({ timeout: 30_000 });
  expect(await buttons.count()).toBeGreaterThanOrEqual(2);
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");

  const pickerTop = async () => {
    const rect = await buttons.first().boundingBox();
    expect(rect).not.toBeNull();
    return Math.round(rect!.y);
  };
  const before = await pickerTop();

  await page.keyboard.press("2");
  await expect(buttons.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/[?&]type=/);
  await expect(
    page.getByRole("heading", { name: "Pick a time" }),
  ).toBeVisible();
  expect(await pickerTop()).toBe(before);

  await page.keyboard.press("1");
  await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/[?&]type=/);
  expect(await pickerTop()).toBe(before);
});
