import { renderHook } from "@testing-library/react";
import { type CalendarId } from "@core/types/domain-primitives";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  resetDefaultCalendarStoreForTests,
  setDefaultCalendarId,
  useDefaultCalendarId,
} from "./default-calendar.store";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";

const calendarId = (value: string) => value as CalendarId;

const readDefaultCalendarId = () =>
  renderHook(useDefaultCalendarId).result.current;

describe("default-calendar.store", () => {
  beforeEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.DEFAULT_CALENDAR_ID);
    resetDefaultCalendarStoreForTests();
  });

  it("has no default until one is chosen", () => {
    expect(readDefaultCalendarId()).toBeNull();
  });

  it("persists the chosen calendar and reads it back after a reload", () => {
    expect(setDefaultCalendarId(calendarId("cal-1"))).toBe(true);

    expect(readDefaultCalendarId()).toBe("cal-1");
    expect(persistentBrowserStore.get(STORAGE_KEYS.DEFAULT_CALENDAR_ID)).toBe(
      "cal-1",
    );

    // A fresh page load re-reads storage rather than the in-memory value.
    resetDefaultCalendarStoreForTests();
    expect(readDefaultCalendarId()).toBe("cal-1");
  });

  it("clears the preference when passed null", () => {
    setDefaultCalendarId(calendarId("cal-1"));

    expect(setDefaultCalendarId(null)).toBe(true);
    expect(readDefaultCalendarId()).toBeNull();
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.DEFAULT_CALENDAR_ID),
    ).toBeNull();
  });

  it("leaves the store untouched when the storage write fails", () => {
    setDefaultCalendarId(calendarId("cal-1"));
    const setSpy = spyOn(persistentBrowserStore, "set").mockReturnValue(false);

    expect(setDefaultCalendarId(calendarId("cal-2"))).toBe(false);
    // Reporting cal-2 here would show the user a preference that did not stick.
    expect(readDefaultCalendarId()).toBe("cal-1");

    setSpy.mockRestore();
  });
});
