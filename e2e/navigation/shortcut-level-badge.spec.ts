import { expect, test } from "@playwright/test";
import {
  dispatchDocumentKey,
  getPaletteSearch,
  openCommandPaletteWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const getLevelBadge = (page: import("@playwright/test").Page) =>
  page.getByRole("button", { name: /Shortcut level/ });

test("the level badge shows progress and hides via the command palette", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const badge = getLevelBadge(page);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText("Lv 1");
  await expect(badge).toHaveAccessibleName(/Shortcut level 1, Newcomer/);

  // T (today) and J (previous period) are both registry shortcuts, so the
  // used count should grow past zero.
  await dispatchDocumentKey(page, "t");
  await dispatchDocumentKey(page, "j");

  await badge.hover();
  await expect(page.getByText(/[1-9]\d* of \d+ shortcuts used/)).toBeVisible();

  await openCommandPaletteWithKeyboard(page);
  const search = getPaletteSearch(page);
  await search.fill("Hide shortcut level");
  await expect(
    page.getByRole("option", { name: "Hide shortcut level" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(getLevelBadge(page)).toHaveCount(0);

  // Hidden survives a reload, matching every other localStorage preference.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(getLevelBadge(page)).toHaveCount(0);

  // Restore via the palette so the toggle proves reversible, not just
  // observed once in one direction.
  await openCommandPaletteWithKeyboard(page);
  await getPaletteSearch(page).fill("Show shortcut level");
  await expect(
    page.getByRole("option", { name: "Show shortcut level" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(getLevelBadge(page)).toBeVisible();
});

test("the level badge's Hide level control is keyboard reachable", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const badge = getLevelBadge(page);
  await badge.focus();
  await expect(badge).toBeFocused();

  const hideLevel = page.getByRole("button", { name: "Hide level" });
  await expect(hideLevel).toBeVisible();
  await hideLevel.focus();
  await expect(hideLevel).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(badge).toHaveCount(0);
});
