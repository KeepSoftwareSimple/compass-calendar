import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  getTimezoneMismatchSnoozedBrowser,
  shouldShowTimezoneMismatch,
  snoozeTimezoneMismatch,
  timezoneMismatchCopy,
} from "@web/timezone/timezone-mismatch";
import { describe, expect, it } from "bun:test";

describe("shouldShowTimezoneMismatch", () => {
  it("hides for Auto even when the browser zone is set", () => {
    expect(shouldShowTimezoneMismatch(null, "America/Denver", null)).toBe(
      false,
    );
  });

  it("hides when the pin matches the browser", () => {
    expect(
      shouldShowTimezoneMismatch("America/Denver", "America/Denver", null),
    ).toBe(false);
  });

  it("shows when a pin differs from the browser", () => {
    expect(
      shouldShowTimezoneMismatch("America/New_York", "America/Denver", null),
    ).toBe(true);
  });

  it("hides while snoozed for the current browser zone", () => {
    expect(
      shouldShowTimezoneMismatch(
        "America/New_York",
        "America/Denver",
        "America/Denver",
      ),
    ).toBe(false);
  });

  it("shows again after the browser zone changes", () => {
    expect(
      shouldShowTimezoneMismatch(
        "America/New_York",
        "America/Chicago",
        "America/Denver",
      ),
    ).toBe(true);
  });
});

describe("timezoneMismatchCopy", () => {
  it("names both cities and abbreviations without an em dash", () => {
    const copy = timezoneMismatchCopy(
      "America/Denver",
      "America/New_York",
      new Date("2026-08-20T18:00:00.000Z"),
    );

    expect(copy.message).toBe(
      "Your device is in Denver time (MDT) but your calendar is showing New York time (EDT).",
    );
    expect(copy.message).not.toContain("\u2014");
    expect(copy.switchLabel).toBe("Switch to MDT");
    expect(copy.keepLabel).toBe("Keep EDT");
  });
});

describe("timezone mismatch snooze", () => {
  it("persists the browser zone Keep was clicked for", () => {
    snoozeTimezoneMismatch("America/Denver");

    expect(getTimezoneMismatchSnoozedBrowser()).toBe("America/Denver");
    expect(
      persistentBrowserStore.get(
        STORAGE_KEYS.TIMEZONE_MISMATCH_SNOOZED_BROWSER,
      ),
    ).toBe("America/Denver");
  });
});
