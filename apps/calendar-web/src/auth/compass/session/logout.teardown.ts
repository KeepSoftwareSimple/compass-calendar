/**
 * Resets account-scoped client state after logout.
 *
 * INVARIANT: callers must clear auth state FIRST via clearAuthenticationState(),
 * because refreshEventRepositorySource reads hasUserEverAuthenticated(). If auth
 * state is still true when refreshEventRepositorySource runs, it will compute the
 * wrong source and be a no-op.
 */

import { queryClient } from "@web/api/query-client";
import { clearGoogleSyncIndicatorOverride } from "@web/auth/providers/sync.indicator.state";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { draftActions } from "@web/events/stores/draft.store";
import { closeStream } from "@web/sse/client/sse.client";

/**
 * Clears module-scoped state (repository source, metadata, SSE stream, drafts).
 * Call this before the minimum-display wait so React has time to flush
 * setAuthenticated(false) before any cache-eviction refetches fire.
 */
export function clearAccountScopedClientState(): void {
  // Flip remote→local, which transitively clears undo history via the
  // undo store's repository-source subscription.
  refreshEventRepositorySource(false);

  // Clear Google connection metadata.
  userMetadataActions.clear();

  // Kill the sync shimmer.
  clearGoogleSyncIndicatorOverride();

  // Close the SSE stream (idempotent).
  closeStream();

  // Discard any open event form for a remote event.
  draftActions.discard();
}

/**
 * Evicts account-scoped query caches. Call this AFTER the minimum-display wait
 * and setAuthenticated(false) so observers refetch against the correct auth state.
 */
export function clearAccountScopedQueryCache(): void {
  queryClient.removeQueries({ queryKey: eventQueryKeys.all });
  queryClient.removeQueries({ queryKey: calendarQueryKeys.all });
  queryClient.removeQueries({ queryKey: ["availability"] });
}
