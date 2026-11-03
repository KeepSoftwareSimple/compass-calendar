import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import {
  createEventTitle,
  ensureSidebarOpen,
  fillTitleAndSaveEventForm,
  openAllDayEventFormWithKeyboard,
  openEventForEditingWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

// A small, representative smoke suite rather than a bespoke scan per
// component - see "How Axe Coverage Works" in
// docs/development/testing-playbook.md. Each checkpoint reveals or hides a
// distinct UI state (dialogs/menus/errors don't exist until activated), so
// each gets its own scan instead of relying on one page-load scan to cover
// everything.

test("week view renders with no automatically detectable accessibility violations", async ({
  page,
}) => {
  await prepareCalendarPage(page);
  await ensureSidebarOpen(page);

  await expectNoAxeViolations(page, { checkpoint: "week view" });
});

test("the timed event form is accessible when open", async ({ page }) => {
  await prepareCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);

  await expectNoAxeViolations(page, { checkpoint: "timed event form open" });
});

test("the all-day event form is accessible when open", async ({ page }) => {
  await prepareCalendarPage(page);
  await openAllDayEventFormWithKeyboard(page);

  await expectNoAxeViolations(page, { checkpoint: "all-day event form open" });
});

test("the event action row is accessible", async ({ page }) => {
  await prepareCalendarPage(page);
  const title = createEventTitle("A11y Checkpoint");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await openEventForEditingWithKeyboard(page, title);

  const actionRow = page
    .getByRole("form")
    .getByRole("group", { name: "Event actions" });
  await expect(actionRow).toBeVisible();
  await actionRow.getByRole("button", { name: "Duplicate" }).focus();

  await expectNoAxeViolations(page, {
    checkpoint: "event action row",
  });
});

test("the invalid-date validation error is accessible", async ({ page }) => {
  await prepareCalendarPage(page);
  await openAllDayEventFormWithKeyboard(page);

  const startDateInput = page.locator('input[title="Pick Start Date"]');
  await startDateInput.fill("not a date");
  await startDateInput.press("Enter");
  await expect(page.getByRole("alert")).toBeVisible();

  await expectNoAxeViolations(page, { checkpoint: "invalid date error toast" });
});

test("week and day views expose one main landmark beside the sidebar", async ({
  page,
}) => {
  await prepareCalendarPage(page);
  await ensureSidebarOpen(page);

  // Landmarks only: screen readers can jump to the calendar or the sidebar.
  // They add no tab stops, so keyboard focus order is unchanged.
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("main").locator("#mainGrid")).toHaveCount(1);
  await expect(page.getByRole("complementary").first()).toBeVisible();

  await page.goto("/day", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("main")).toHaveCount(1);
});
