import { useSyncExternalStore } from "react";
import { createExternalStore } from "@web/common/utils/external-store.util";
import { type EventRepositorySource } from "./event.repository.factory";
import { getEventRepositorySource } from "./event.repository.util";

/**
 * Reactive mirror of the event repository source ("local" | "remote").
 *
 * `getEventRepositorySource` reads non-reactive module state (Google/auth/backend
 * flags), so it cannot drive TanStack Query keys on its own. This store recomputes
 * the source on demand and notifies `useSyncExternalStore` subscribers, so query
 * hooks re-key (and thus refetch from the correct source) when auth state flips.
 *
 * `refreshEventRepositorySource` must be called at every source transition; the
 * remembered session flag lets auth-side callers recompute without passing it.
 *
 * Related: docs/frontend/frontend-runtime-flow.md
 */
let lastSessionExists = false;
let hasComputed = false;

// Seeded with a placeholder; the real source is computed lazily on first use.
// Computing at module-init would read remembered authentication before the
// application has initialized it, so resolve the source lazily instead.
const sourceStore = createExternalStore<EventRepositorySource>("local");

/**
 * Recompute the repository source and notify subscribers.
 * @param sessionExists Optional session flag; defaults to the last remembered value.
 */
export function refreshEventRepositorySource(sessionExists?: boolean): void {
  if (sessionExists !== undefined) {
    lastSessionExists = sessionExists;
  }

  hasComputed = true;
  sourceStore.set(getEventRepositorySource(lastSessionExists));
}

/**
 * React hook: subscribe to the current event repository source.
 */
export function useEventRepositorySource(): EventRepositorySource {
  // Compute the real source on first use (see note on lazy init above).
  if (!hasComputed) {
    refreshEventRepositorySource();
  }

  return useSyncExternalStore(sourceStore.subscribe, sourceStore.get);
}

/**
 * Non-React subscription to source changes, for module-level side effects
 * (undo.store.ts clears history on a local<->remote flip or logout — both
 * manifest as a source change here). Prefer useEventRepositorySource() in
 * components; this exists for singleton modules that can't use hooks.
 */
export const subscribeToEventRepositorySource = sourceStore.subscribe;
export const getEventRepositorySourceSnapshot = sourceStore.get;

/**
 * Test-only: clears the lazily-computed source cache so the next
 * `useEventRepositorySource()` call recomputes from scratch instead of
 * inheriting whatever a previous test (possibly in a different file, since
 * this module is a process-wide singleton) last resolved. Without this, a
 * test that authenticates a session leaves `lastSessionExists`/`hasComputed`
 * set, so every later test - even ones that never touch auth - silently
 * reads/writes through the remote repository instead of the local one.
 */
export function resetEventRepositorySourceForTests(): void {
  lastSessionExists = false;
  hasComputed = false;
  sourceStore.set("local");
}
