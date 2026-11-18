import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { isLifePathname } from "@web/components/RootShell/isLifePathname";
import { suspendCalendarGridInteraction } from "@web/events/stores/suspendCalendarGridInteraction";

/**
 * Discards invisible grid drafts and calendar-only sidebar modes when the user
 * lands on Life so stale hints cannot outrank Life shortcuts.
 */
export function useSuspendCalendarGridOnLifeView(): void {
  const { pathname } = useLocation();
  const isLifeView = isLifePathname(pathname);
  const wasLifeRef = useRef(isLifeView);

  useEffect(() => {
    if (isLifeView && !wasLifeRef.current) {
      suspendCalendarGridInteraction();
    }
    wasLifeRef.current = isLifeView;
  }, [isLifeView]);
}
