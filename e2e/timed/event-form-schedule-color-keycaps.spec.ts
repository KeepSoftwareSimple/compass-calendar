import { expect, test } from "@playwright/test";
import {
  installDeterministicBrowserClock,
  openEventForEditingWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

const EVENT_TITLE = "Keyboard schedule color hints";

test("shows date, time, and color keycaps on the event form", async ({
  page,
}, testInfo) => {
  await installDeterministicBrowserClock(page);
  await prepareTimedCalendarPage(page);

  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("compass.localCalendarId")),
    )
    .not.toBeNull();

  await page.evaluate(
    async ({ title, id }) => {
      const calendarId = localStorage.getItem("compass.localCalendarId");
      if (!calendarId) throw new Error("missing local calendar id");
      const record = {
        version: 2,
        id,
        isDemo: false,
        event: {
          id,
          calendarId,
          content: {
            kind: "details",
            title,
            description: "",
          },
          schedule: {
            kind: "timed",
            start: "2026-04-24T15:00:00.000Z",
            end: "2026-04-24T16:00:00.000Z",
            timeZone: "UTC",
          },
          recurrence: { kind: "single" },
          createdAt: "2026-04-24T10:00:00.000Z",
          updatedAt: null,
        },
      };

      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("compass-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("events", "readwrite");
          tx.objectStore("events").put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    { title: EVENT_TITLE, id: "e2e0000000000000000000002" },
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#mainGrid").waitFor({ state: "visible", timeout: 15000 });

  await openEventForEditingWithKeyboard(page, EVENT_TITLE);

  const form = page.getByRole("form");
  const startDate = form.getByTitle("Pick Start Date");
  await startDate.focus();
  await expect(
    form.locator("#eventFormStartDate").getByTestId("event-form-control-hint"),
  ).toBeVisible();

  const endTime = form.getByRole("combobox", { name: "End time" });
  await expect(endTime).toBeVisible();
  await expect(endTime).toBeInViewport();

  const colorJump = form.locator("#event-form-color .ml-auto");
  await expect(colorJump.locator(".c-keycap").first()).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 960 });
  const sidebar = page.locator("#sidebar");
  await sidebar.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(form.getByPlaceholder("Title")).toBeInViewport();
  await expect(endTime).toBeInViewport();

  await sidebar.screenshot({
    path: test.info().outputPath("event-form-date-focused-no-overlap.png"),
  });
  await sidebar.screenshot({
    path: test.info().outputPath("event-form-schedule-color-keycaps.png"),
  });
  await sidebar.screenshot({
    path: testInfo.outputPath("event-form-schedule-color-keycaps.png"),
  });
});
