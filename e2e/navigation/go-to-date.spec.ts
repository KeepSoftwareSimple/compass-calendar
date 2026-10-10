import { expect, test } from "@playwright/test";
import {
  dispatchDocumentKey,
  getPaletteSearch,
  getVisibleDayDates,
  prepareCalendarPage,
} from "../utils/event-test-utils";

async function goToDateFromPalette(
  page: Parameters<typeof prepareCalendarPage>[0],
  query: string,
  optionName: string,
  expectedDate: string,
  announcement: string,
) {
  await dispatchDocumentKey(page, "g");
  const search = getPaletteSearch(page);
  await expect(search).toBeVisible();
  await search.fill(query);
  await expect(page.getByRole("option", { name: optionName })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(search).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/week/${expectedDate}`));
  await expect.poll(() => getVisibleDayDates(page)).toContain(expectedDate);
  await expect(
    page.getByRole("status").filter({ hasText: announcement }),
  ).toBeVisible();
}

test("G then a typed date selects that day and announces the week", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  await goToDateFromPalette(
    page,
    "2026-12-15",
    "Go to Tue, Dec 15, 2026",
    "2026-12-15",
    "Showing week of Tuesday, December 15, 2026",
  );
});

test("G accepts slash-separated ISO-style dates", async ({ page }) => {
  await prepareCalendarPage(page);

  await goToDateFromPalette(
    page,
    "2026/10/29",
    "Go to Thu, Oct 29, 2026",
    "2026-10-29",
    "Showing week of Thursday, October 29, 2026",
  );
});

test("G accepts month-first dates without a year", async ({ page }) => {
  await prepareCalendarPage(page);

  await goToDateFromPalette(
    page,
    "10/29",
    "Go to Thu, Oct 29, 2026",
    "2026-10-29",
    "Showing week of Thursday, October 29, 2026",
  );
});
