import { useEffect, useState } from "react";
import { calendarEventIdElementSelector } from "@web/grid/interaction/view-event-registry";

/**
 * View-agnostic version of useIsGridEventFocused: the sidebar status bar is
 * mounted regardless of which calendar view is active, so it checks either
 * view's id attribute (Day and Week are never co-mounted) instead of taking
 * a view-specific getFocused callback.
 */
export function useIsAnyCalendarEventFocused(): boolean {
  const [focused, setFocused] = useState(
    () =>
      document.activeElement?.closest(calendarEventIdElementSelector()) != null,
  );

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setFocused(
          document.activeElement?.closest(calendarEventIdElementSelector()) !=
            null,
        );
      });
    };

    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);

  return focused;
}
