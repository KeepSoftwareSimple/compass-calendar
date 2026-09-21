import { useState } from "react";
import { type CalendarId } from "@core/types/domain-primitives";
import { setCalendarVisibility } from "@web/calendars/calendar-visibility.store";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import {
  isRestoringHistory,
  undoHistoryActions,
} from "@web/events/stores/undo.store";

export const CALENDAR_VISIBILITY_FAILURE_MESSAGE =
  "Couldn't update calendar visibility. The change was undone.";

export const calendarVisibilityStatusMessage = (
  isVisible: boolean,
  label: string,
) => (isVisible ? `Showing ${label} calendar` : `Hidden ${label} calendar`);

/**
 * Client-owned calendar visibility toggle (S39 A2).
 * Persists the hidden set in localStorage (default visible) and notifies the
 * reactive hidden-ids store; the calendars query's `select` re-derives
 * isVisible from that store on every read (calendar.query.ts), so this hook
 * only writes storage once - no cache patch to keep in sync. Event queries
 * keep their data; the week/day view models filter by isVisible so hide and
 * show both update the grid without a round trip. No server write - sync
 * list always reports isVisible:true, and the event read already returns
 * every calendar (client filter is the source of truth).
 */
export function useCalendarVisibility() {
  const [announcement, setAnnouncement] = useState("");

  const toggleCalendarVisibility = (
    calendarId: CalendarId,
    isVisible: boolean,
    label: string,
  ) => {
    const saved = setCalendarVisibility(calendarId, isVisible);
    if (!saved) {
      showErrorToast(CALENDAR_VISIBILITY_FAILURE_MESSAGE);
      setAnnouncement(CALENDAR_VISIBILITY_FAILURE_MESSAGE);
      return;
    }

    if (!isRestoringHistory()) {
      undoHistoryActions.record({
        kind: "calendarVisibility",
        calendarId,
        label,
        isVisible,
      });
    }

    setAnnouncement(calendarVisibilityStatusMessage(isVisible, label));
  };

  return { toggleCalendarVisibility, announcement };
}
