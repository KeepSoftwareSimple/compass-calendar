import { expect, test } from "@playwright/test";
import {
  dispatchDocumentKey,
  getPaletteSearch,
  getVisibleDayDates,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test("G then a typed date selects that day and announces the week", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  await dispatchDocumentKey(page, "g");
  const search = getPaletteSearch(page);
  await expect(search).toBeVisible();
  await search.fill("2026-12-15");
  await expect(
    page.getByRole("option", { name: "Go to Tue, Dec 15, 2026" }),
  ).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(search).toHaveCount(0);
  await expect(page).toHaveURL(/\/week\/2026-12-15/);
  await expect.poll(() => getVisibleDayDates(page)).toContain("2026-12-15");
  await expect(
    page.getByRole("status").filter({
      hasText: "Showing week of Tuesday, December 15, 2026",
    }),
  ).toBeVisible();
});
