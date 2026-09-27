import { act, renderHook } from "@testing-library/react";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { isCalendarHidden } from "./calendar-visibility.storage";
import {
  setCalendarVisibility,
  useHiddenCalendarIds,
} from "./calendar-visibility.store";
import { describe, expect, it, spyOn } from "bun:test";

const calendarId = CalendarIdSchema.parse(createObjectIdString());

// Storage clearing + the hidden-ids store resync between tests are both
// handled by the global test-lifecycle afterEach (resetBrowserState +
// resetAllStores) - see apps/calendar-web/src/__tests__/setup/test-lifecycle.ts.

describe("calendar-visibility.store", () => {
  it("persists a visibility change and notifies subscribers", () => {
    const { result } = renderHook(() => useHiddenCalendarIds());

    expect(result.current.has(calendarId)).toBe(false);

    act(() => {
      expect(setCalendarVisibility(calendarId, false)).toBe(true);
    });

    expect(result.current.has(calendarId)).toBe(true);
    expect(isCalendarHidden(calendarId)).toBe(true);

    act(() => {
      expect(setCalendarVisibility(calendarId, true)).toBe(true);
    });

    expect(result.current.has(calendarId)).toBe(false);
  });

  it("leaves the store untouched when the storage write fails", () => {
    const setSpy = spyOn(persistentBrowserStore, "set").mockReturnValue(false);
    const { result } = renderHook(() => useHiddenCalendarIds());

    act(() => {
      expect(setCalendarVisibility(calendarId, false)).toBe(false);
    });

    expect(result.current.has(calendarId)).toBe(false);
    setSpy.mockRestore();
  });

  it("picks up a hide written by another tab via the storage event", () => {
    const { result } = renderHook(() => useHiddenCalendarIds());
    expect(result.current.has(calendarId)).toBe(false);

    // A same-tab write never fires "storage" (browsers only dispatch it to
    // other tabs), so this simulates the cross-tab case directly: write
    // through the raw persistence layer (bypassing this store's setter,
    // mirroring another tab's process), then replay the event this window
    // would receive.
    persistentBrowserStore.set(
      STORAGE_KEYS.HIDDEN_CALENDAR_IDS,
      JSON.stringify([calendarId]),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.HIDDEN_CALENDAR_IDS }),
      );
    });

    expect(result.current.has(calendarId)).toBe(true);
  });

  it("ignores storage events for unrelated keys", () => {
    const { result } = renderHook(() => useHiddenCalendarIds());

    persistentBrowserStore.set(
      STORAGE_KEYS.HIDDEN_CALENDAR_IDS,
      JSON.stringify([calendarId]),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.SIDEBAR_OPEN }),
      );
    });

    expect(result.current.has(calendarId)).toBe(false);
  });
});
