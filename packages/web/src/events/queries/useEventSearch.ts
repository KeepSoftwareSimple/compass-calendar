import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  EVENT_TITLE_SEARCH_MIN,
  eventTitleSearchWindow,
} from "@core/event/search-events-by-title";
import { throwIfAborted } from "@web/api/util/api.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { RemoteEventRepository } from "@web/events/repositories/remote.event.repository";

const SEARCH_DEBOUNCE_MS = 250;

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useEventSearch(query: string) {
  const source = useEventRepositorySource();
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const enabled = debounced.length >= EVENT_TITLE_SEARCH_MIN;

  return useQuery({
    queryKey: eventQueryKeys.search({ source, q: debounced }),
    queryFn: async ({ signal }) => {
      if (source === "local") {
        const { fetchLocalEventsByTitle } = await import(
          "@web/events/queries/event.query.local"
        );
        throwIfAborted(signal);
        return fetchLocalEventsByTitle(debounced);
      }
      const window = eventTitleSearchWindow();
      return new RemoteEventRepository().list(
        {
          kind: "range",
          start: window.start,
          end: window.end,
          q: debounced,
        },
        signal,
      );
    },
    enabled,
    staleTime: 30_000,
  });
}
