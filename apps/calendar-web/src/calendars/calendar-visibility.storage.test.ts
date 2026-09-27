import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  isCalendarHidden,
  readHiddenCalendarIds,
  setCalendarHidden,
  writeHiddenCalendarIds,
} from "./calendar-visibility.storage";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  persistentBrowserStore.remove(STORAGE_KEYS.HIDDEN_CALENDAR_IDS);
});

describe("calendar-visibility.storage", () => {
  it("defaults to no hidden calendars (everything visible)", () => {
    expect(readHiddenCalendarIds().size).toBe(0);
    expect(isCalendarHidden("aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("round-trips a hidden id set", () => {
    expect(setCalendarHidden("aaaaaaaaaaaaaaaaaaaaaaaa", true)).toBe(true);
    expect(isCalendarHidden("aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(true);
    expect(setCalendarHidden("aaaaaaaaaaaaaaaaaaaaaaaa", false)).toBe(true);
    expect(isCalendarHidden("aaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
  });

  it("clears the storage key when the hidden set becomes empty", () => {
    writeHiddenCalendarIds(new Set(["aaaaaaaaaaaaaaaaaaaaaaaa"]));
    writeHiddenCalendarIds(new Set());
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HIDDEN_CALENDAR_IDS),
    ).toBeNull();
  });

  it("treats malformed storage as empty (fail open to visible)", () => {
    persistentBrowserStore.set(STORAGE_KEYS.HIDDEN_CALENDAR_IDS, "{not-json");
    expect(readHiddenCalendarIds().size).toBe(0);
  });
});
