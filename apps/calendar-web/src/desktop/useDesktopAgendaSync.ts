import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { DesktopAgendaSchema } from "@core/types/desktop-bridge.contracts";
import { useTodayTimedEvents } from "@web/components/Sidebar/UpNextCard/useUpNextEvent";
import {
  buildDesktopAgenda,
  DESKTOP_AGENDA_DEBOUNCE_MS,
} from "@web/desktop/desktop-agenda.logic";
import { isDesktop } from "@web/desktop/isDesktop";
import { isEventQueryKey } from "@web/events/queries/event.query.cache";

/**
 * Pushes today's agenda to the macOS menu bar on cache changes and on the
 * minute tick, debounced so bursts of optimistic updates coalesce.
 */
export function useDesktopAgendaSync(): void {
  const queryClient = useQueryClient();
  const { now, allTimedEvents } = useTodayTimedEvents();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef<string>("");

  useEffect(() => {
    if (!isDesktop()) {
      return;
    }

    const pushAgenda = () => {
      const bridge = window.compassDesktop;
      if (!bridge) {
        return;
      }
      const agenda = buildDesktopAgenda(now, allTimedEvents);
      const parsed = DesktopAgendaSchema.parse(agenda);
      const payload = JSON.stringify(parsed);
      if (payload === lastPayloadRef.current) {
        return;
      }
      lastPayloadRef.current = payload;
      bridge.setAgenda(parsed);
    };

    const schedulePush = () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        pushAgenda();
      }, DESKTOP_AGENDA_DEBOUNCE_MS);
    };

    schedulePush();

    const unsubscribe = queryClient.getQueryCache().subscribe((notifyEvent) => {
      if (notifyEvent.type !== "updated") {
        return;
      }
      if (!isEventQueryKey(notifyEvent.query.queryKey)) {
        return;
      }
      schedulePush();
    });

    return () => {
      unsubscribe();
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [allTimedEvents, now, queryClient]);
}
