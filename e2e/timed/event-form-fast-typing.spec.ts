import { expect, test } from "@playwright/test";
import {
  installDeterministicBrowserClock,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

const FAST_STRING =
  "Quarterly planning workshop with product design and research teams";

test.beforeEach(async ({ page }) => {
  // Temporary #5039 diagnosis, remove before this branch is ready.
  await page.addInitScript(() => {
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (options?: FocusOptions) {
      if (
        document.activeElement?.id === "event-form-title" &&
        this !== document.activeElement
      ) {
        console.log(
          "TITLE_FOCUS_HANDOFF",
          this.tagName,
          this.id,
          new Error().stack,
        );
      }
      originalFocus.call(this, options);
    };
    document.addEventListener(
      "focusout",
      (event) => {
        if ((event.target as HTMLElement).id === "event-form-title") {
          const next = (event as FocusEvent)
            .relatedTarget as HTMLElement | null;
          console.log(
            "TITLE_FOCUS_OUT",
            next?.tagName,
            next?.id,
            (event.target as HTMLElement).isConnected,
            new Error().stack,
          );
        }
      },
      true,
    );
  });
  await installDeterministicBrowserClock(page);
  await prepareTimedCalendarPage(page);
});

test("title keeps every character when typed quickly in day view", async ({
  page,
}) => {
  await page.keyboard.press("d");
  await page.waitForURL((url) => url.pathname.startsWith("/day"), {
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
