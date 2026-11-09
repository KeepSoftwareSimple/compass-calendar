import { expect, test } from "@playwright/test";
import {
  installDeterministicBrowserClock,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

const FAST_STRING =
  "Quarterly planning workshop with product design and research teams";

test.beforeEach(async ({ page }) => {
  await installDeterministicBrowserClock(page);
  await prepareTimedCalendarPage(page);
});

test("title keeps every character when typed quickly in day view", async ({
  page,
}) => {
  await page.keyboard.press("d");
  await page.waitForURL((url) => url.pathname.startsWith("/day"), {
    waitUntil: "domcontentloaded",
    timeout: 10_000,
  });

  await openTimedEventFormWithKeyboard(page);
  const title = page.getByRole("form").getByPlaceholder("Title");
  await title.focus();
  await title.fill("");

  const started = Date.now();
  await page.keyboard.type(FAST_STRING, { delay: 0 });
  const durationMs = Date.now() - started;
  await title.blur();
  await page.waitForTimeout(100);

  await expect(title).toHaveValue(FAST_STRING);
  expect(durationMs).toBeLessThan(10_000);
});

test("numeric title survives fast typing without letter shortcuts", async ({
  page,
}) => {
  await page.keyboard.press("d");
  await openTimedEventFormWithKeyboard(page);
  const title = page.getByRole("form").getByPlaceholder("Title");
  await title.focus();
  const digits = "123456789012345678901234567890";
  await page.keyboard.type(digits, { delay: 0 });
  await expect(title).toHaveValue(digits);
});

test("start time keeps typed digits when entered quickly", async ({ page }) => {
  await openTimedEventFormWithKeyboard(page);
  const startTime = page.getByRole("combobox", { name: "Start time" });
  await startTime.focus();
  const typed = "1030a";
  await page.keyboard.type(typed, { delay: 0 });
  await page.waitForTimeout(300);
  const value = await startTime.inputValue();
  expect(value.replace(/\s/g, "").toLowerCase()).toContain("1030");
});

// Location stays a controlled input fed by local state, unlike the title,
// which #5038 made uncontrolled. #5035 wrapped both setters in flushSync on
// the theory that the lag was the local state; #5038 disproved that for the
// title and dropped it there. Nothing covered location either way, so pin it:
// the draft store push is deferred to a frame, and React flushes a discrete
// change handler before paint, so every character must survive without a
// forced synchronous render per keystroke.
test("location keeps every character when typed quickly", async ({ page }) => {
  await openTimedEventFormWithKeyboard(page);
  const location = page.getByRole("textbox", { name: "Location" });
  await location.focus();

  await page.keyboard.type(FAST_STRING, { delay: 0 });
  await page.waitForTimeout(100);

  await expect(location).toHaveValue(FAST_STRING);
});
