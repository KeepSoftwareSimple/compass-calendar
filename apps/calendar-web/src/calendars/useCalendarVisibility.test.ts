import { act, renderHook } from "@testing-library/react";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { useHiddenCalendarIds } from "@web/calendars/calendar-visibility.store";
import {
  CALENDAR_VISIBILITY_FAILURE_MESSAGE,
  calendarVisibilityStatusMessage,
  useCalendarVisibility,
} from "@web/calendars/useCalendarVisibility";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { useUndoHistoryStore } from "@web/events/stores/undo.store";
import { describe, expect, it, spyOn } from "bun:test";

const calendarId = CalendarIdSchema.parse(createObjectIdString());

describe("useCalendarVisibility", () => {
  it("records a hide when the write lands", () => {
    const { result } = renderHook(() => ({
      visibility: useCalendarVisibility(),
      hiddenIds: useHiddenCalendarIds(),
    }));

    act(() => {
      result.current.visibility.toggleCalendarVisibility(
        calendarId,
        false,
        "Work",
      );
    });

    expect(result.current.hiddenIds.has(calendarId)).toBe(true);
    expect(result.current.visibility.announcement).toBe(
      calendarVisibilityStatusMessage(false, "Work"),
    );
    expect(useUndoHistoryStore.getState().past).toEqual([
      {
        kind: "calendarVisibility",
        calendarId,
        label: "Work",
        isVisible: false,
      },
    ]);
  });

  it("records nothing when the storage write fails", () => {
    const setSpy = spyOn(persistentBrowserStore, "set").mockReturnValue(false);
    const { result } = renderHook(() => useCalendarVisibility());

    act(() => {
      result.current.toggleCalendarVisibility(calendarId, false, "Work");
    });

    expect(result.current.announcement).toBe(
      CALENDAR_VISIBILITY_FAILURE_MESSAGE,
    );
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    setSpy.mockRestore();
  });
});
