import { test } from "@playwright/test";
import {
  createEventTitle,
  deleteEventWithKeyboard,
  expectSidebarEditingRingOnGridEvent,
  expectTimedEventMissing,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  openEventForEditingWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
  updateEventTitle,
} from "../utils/event-test-utils";

test("creates, edits, and deletes a timed event", async ({ page }) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Timed Event");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  await openEventForEditingWithKeyboard(page, title);
  await expectSidebarEditingRingOnGridEvent(page, title);

  const updatedTitle = updateEventTitle("Timed Event");
  await fillTitleAndSaveEventForm(page, updatedTitle);
  await expectTimedEventVisible(page, updatedTitle);
  await expectTimedEventMissing(page, title);

  await openEventForEditingWithKeyboard(page, updatedTitle);
  await deleteEventWithKeyboard(page);
  await expectTimedEventMissing(page, updatedTitle);
});
