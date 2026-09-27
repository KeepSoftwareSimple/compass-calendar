import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DemoEventsRange,
  hasDemoEvents,
} from "@web/events/demo-events.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";

function rangeKey(range?: DemoEventsRange): string {
  return range ? `${range.start}|${range.end}` : "";
}

export function useDemoEventsPresent(range?: DemoEventsRange): boolean {
  const queryClient = useQueryClient();
  const source = useEventRepositorySource();
  const [state, setState] = useState<{
    present: boolean;
    key: string;
  }>({ present: false, key: "" });
  const refreshGenerationRef = useRef(0);
  const rangeStart = range?.start;
  const rangeEnd = range?.end;
  const currentKey = rangeKey(
    rangeStart !== undefined && rangeEnd !== undefined
      ? { start: rangeStart, end: rangeEnd }
      : undefined,
  );

  const refresh = useCallback(() => {
    if (source !== "local") {
      refreshGenerationRef.current += 1;
      setState({ present: false, key: currentKey });
      return;
    }

    refreshGenerationRef.current += 1;
    const generation = refreshGenerationRef.current;
    const rangeArg =
      rangeStart !== undefined && rangeEnd !== undefined
        ? { start: rangeStart, end: rangeEnd }
        : undefined;
    void hasDemoEvents(rangeArg)
      .then((result) => {
        if (generation === refreshGenerationRef.current) {
          setState({ present: result, key: rangeKey(rangeArg) });
        }
      })
      .catch(() => {
        // IndexedDB probe is best-effort; treat failures as "no demo events"
        // rather than an unhandledrejection.
        if (generation === refreshGenerationRef.current) {
          setState({ present: false, key: rangeKey(rangeArg) });
        }
      });
  }, [currentKey, rangeEnd, rangeStart, source]);

  useEffect(() => {
    refresh();

    return queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        Array.isArray(event.query.queryKey) &&
        event.query.queryKey[0] === eventQueryKeys.all[0]
      ) {
        refresh();
      }
    });
  }, [queryClient, refresh]);

  // Drop stale "present" from a previous range while the next check is in flight.
  return state.key === currentKey && state.present;
}
