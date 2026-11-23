import { useEffect, useState } from "react";
import { calendarEventIdElementSelector } from "@web/grid/interaction/view-event-registry";

const ALL_DAY_ROW_SELECTOR = "[data-allday-row]";

const isEventFocused = () =>
  document.activeElement?.closest(calendarEventIdElementSelector()) != null;

const isAllDayEventFocused = () =>
  isEventFocused() &&
  document.activeElement?.closest(ALL_DAY_ROW_SELECTOR) != null;

function useFocusCheck(check: () => boolean): boolean {
  const [focused, setFocused] = useState(check);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setFocused(check()));
    };

    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, [check]);

  return focused;
}

/**
 * View-agnostic version of useIsGridEventFocused: the sidebar status bar is
 * mounted regardless of which calendar view is active, so it checks either
 * view's id attribute (Day and Week are never co-mounted) instead of taking
 * a view-specific getFocused callback.
 */
export function useIsAnyCalendarEventFocused(): boolean {
  return useFocusCheck(isEventFocused);
}

/** True when the focused event lives in the all-day row. */
export function useIsAllDayEventFocused(): boolean {
  return useFocusCheck(isAllDayEventFocused);
}
