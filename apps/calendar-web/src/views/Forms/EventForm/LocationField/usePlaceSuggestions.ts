import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@web/common/hooks/useDebouncedValue";
import { fetchPlaceSuggestions } from "@web/views/Forms/EventForm/LocationField/places.client";

export const PLACE_SUGGESTION_DEBOUNCE_MS = 250;
export const PLACE_SUGGESTION_MIN_LENGTH = 3;
const PLACE_SUGGESTION_STALE_TIME_MS = 5 * 60 * 1000;
const NO_SUGGESTIONS: string[] = [];

export interface PlaceSuggestionsState {
  suggestions: string[];
  /** True while debouncing or the Places request is in flight. */
  isSearching: boolean;
  isError: boolean;
  isFetched: boolean;
}

/**
 * Debounced Places suggestions for `query`. Disabled without an API key or
 * under the minimum length. Any failure yields no suggestions: they are a
 * convenience, and free typing keeps working.
 */
export function usePlaceSuggestions(
  query: string,
  apiKey: string | undefined,
): PlaceSuggestionsState {
  const trimmed = query.trim();
  const debouncedQuery = useDebouncedValue(
    trimmed,
    PLACE_SUGGESTION_DEBOUNCE_MS,
  );

  const enabled =
    Boolean(apiKey) && debouncedQuery.length >= PLACE_SUGGESTION_MIN_LENGTH;

  const placeQuery = useQuery({
    queryKey: ["place-suggestions", debouncedQuery],
    queryFn: ({ signal }) =>
      fetchPlaceSuggestions(debouncedQuery, apiKey ?? "", signal),
    enabled,
    staleTime: PLACE_SUGGESTION_STALE_TIME_MS,
    retry: false,
  });

  const isSearching =
    trimmed.length >= PLACE_SUGGESTION_MIN_LENGTH &&
    (debouncedQuery !== trimmed || placeQuery.isFetching);

  return {
    suggestions: placeQuery.data ?? NO_SUGGESTIONS,
    isSearching,
    isError: placeQuery.isError,
    isFetched: placeQuery.isFetched,
  };
}
