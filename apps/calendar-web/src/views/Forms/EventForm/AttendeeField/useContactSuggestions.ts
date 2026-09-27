import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import {
  CONTACT_SUGGESTION_QUERY_MIN_LENGTH,
  type ContactSuggestion,
} from "@core/types/contact.contracts";
import { type AttendeeInput } from "@core/types/event-attendance.contracts";
import { ContactsApi } from "@web/api/contacts.api";
import {
  selectCanSuggestContacts,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { scoreCommandItem } from "@web/components/CommandPalette/command-palette.search";
import { type AttendeeSuggestionSource } from "./AttendeeField";

// Quota guard, half one: no request leaves the browser until the user pauses
// typing this long. (Half two is the ≥2-char minimum below; sync adds server
// rate limits behind both.)
export const CONTACT_SUGGESTION_DEBOUNCE_MS = 250;

// Matching queries within this window reuse the cached page instead of
// re-querying the People API (e.g. type, backspace, retype).
const SUGGESTION_STALE_TIME_MS = 30_000;

const contactSuggestionsQueryKey = (query: string) =>
  ["contactSuggestions", query] as const;

/**
 * Rank a suggestion page with the command palette's fuzzy scorer: display
 * name is the label, email the keyword, best score first. Zero-score entries
 * are kept (the People API matched on data the scorer cannot see) but sort
 * last, in server order — the sort is stable via the explicit index.
 */
export function rankContactSuggestions(
  suggestions: readonly ContactSuggestion[],
  query: string,
): ContactSuggestion[] {
  return suggestions
    .map((suggestion, index) => ({
      suggestion,
      index,
      score: scoreCommandItem(
        {
          label: suggestion.displayName ?? suggestion.email,
          keywords: [suggestion.email],
        },
        query,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ suggestion }) => suggestion);
}

const toAttendeeInput = (suggestion: ContactSuggestion): AttendeeInput => ({
  email: suggestion.email,
  displayName: suggestion.displayName,
});

export interface UseContactSuggestionsResult {
  /** True when any connected Google account granted a contacts scope. */
  canSuggestContacts: boolean;
  /**
   * Suggestion source for AttendeeField — present only while the capability
   * is granted. Debounced ≥250ms, ≥2-char minimum, ranked; every failure
   * resolves to [] (raw email entry keeps working, no error toast).
   */
  suggestionSource: AttendeeSuggestionSource | undefined;
}

/**
 * Live Google-contact suggestions for the attendee field, behind TanStack
 * Query (per-query cache + request dedupe). Unmounting the owning form
 * cancels the pending debounce and aborts any in-flight request.
 */
export function useContactSuggestions(): UseContactSuggestionsResult {
  const canSuggestContacts = useUserMetadataStore(selectCanSuggestContacts);
  const queryClient = useQueryClient();

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The promise superseded by a newer keystroke resolves [] immediately —
  // AttendeeField's own version guard ignores it, and nothing leaks.
  const supersededResolveRef = useRef<
    ((value: readonly AttendeeInput[]) => void) | null
  >(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      // Cancel on unmount: drop the pending debounce and abort the wire.
      isMountedRef.current = false;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      supersededResolveRef.current?.([]);
      supersededResolveRef.current = null;
      abortControllerRef.current?.abort();
    };
  }, []);

  const suggestionSource = useCallback<AttendeeSuggestionSource>(
    (rawQuery) =>
      new Promise((resolve) => {
        // A newer keystroke supersedes the pending one entirely.
        if (debounceTimerRef.current !== null) {
          clearTimeout(debounceTimerRef.current);
        }
        supersededResolveRef.current?.([]);
        supersededResolveRef.current = resolve;

        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          supersededResolveRef.current = null;

          const query = rawQuery.trim();
          if (
            !isMountedRef.current ||
            query.length < CONTACT_SUGGESTION_QUERY_MIN_LENGTH
          ) {
            resolve([]);
            return;
          }

          abortControllerRef.current?.abort();
          const controller = new AbortController();
          abortControllerRef.current = controller;

          queryClient
            .fetchQuery({
              queryKey: contactSuggestionsQueryKey(query),
              queryFn: () =>
                ContactsApi.getSuggestions(query, controller.signal),
              staleTime: SUGGESTION_STALE_TIME_MS,
              retry: false,
            })
            .then((response) => {
              resolve(
                rankContactSuggestions(response.suggestions, query).map(
                  toAttendeeInput,
                ),
              );
            })
            .catch(() => {
              // Aborted, offline, or a contract mismatch: suggestions are a
              // convenience — degrade silently to raw email entry.
              resolve([]);
            });
        }, CONTACT_SUGGESTION_DEBOUNCE_MS);
      }),
    [queryClient],
  );

  return {
    canSuggestContacts,
    suggestionSource: canSuggestContacts ? suggestionSource : undefined,
  };
}
