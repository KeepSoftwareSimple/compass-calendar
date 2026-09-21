import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  EVENT_TITLE_SEARCH_MIN,
  eventTitleSearchWindow,
} from "@core/event/search-events-by-title";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { fetchLocalEventsByTitle } from "@web/events/queries/event.query.local";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { getEventRepositoryBySource } from "@web/events/repositories/event.repository.util";

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
  const trimmed = query.trim();
  const debounced = useDebouncedValue(trimmed, SEARCH_DEBOUNCE_MS);
  const enabled = debounced.length >= EVENT_TITLE_SEARCH_MIN;

  const query_ = useQuery({
    queryKey: eventQueryKeys.search({ source, q: debounced }),
    queryFn: ({ signal }) => {
      if (source === "local") {
        return fetchLocalEventsByTitle(debounced);
      }
      const window = eventTitleSearchWindow();
      return getEventRepositoryBySource(source).list(
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
    placeholderData: keepPreviousData,
  });

  const isSearching =
    trimmed.length >= EVENT_TITLE_SEARCH_MIN &&
    (debounced !== trimmed || query_.isPending);

  return { data: query_.data, isSearching };
}
