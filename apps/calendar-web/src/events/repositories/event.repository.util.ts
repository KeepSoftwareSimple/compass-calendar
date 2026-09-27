/**
 * Repository selection entry point.
 * This factory decides whether event reads/writes go to local IndexedDB or the remote API.
 * Remembered auth state and current session state decide the target.
 * Per-account Google reconnect-required is handled by write gates / read-only UI, not by
 * flipping the whole app onto IndexedDB.
 * Reads flow through TanStack Query (see event.query.options.ts + the useXEventsQuery
 * hooks, which resolve the source via event.repository.source.store); mutations flow
 * through the event operations/listeners. The reactive source store must be refreshed at
 * every auth transition so query keys re-key correctly.
 * Start debugging "why isn't this event saving?" here.
 * Related: docs/frontend/frontend-runtime-flow.md
 */

import { hasUserEverAuthenticated } from "@web/auth/compass/state/auth.state.util";
import {
  createGetEventRepositoryBySource,
  createGetEventRepositorySource,
} from "./event.repository.factory";
import { LocalEventRepository } from "./local.event.repository";
import { RemoteEventRepository } from "./remote.event.repository";

/**
 * Determines the repository source (local or remote) based on session and authentication state.
 */
export const getEventRepositorySource = createGetEventRepositorySource({
  hasUserEverAuthenticated,
});

/**
 * Factory function to get the appropriate event repository based on session and authentication state.
 *
 * Repository selection logic:
 * 1. If user has EVER authenticated: Use RemoteEventRepository
 *    - Prevents remote account events from disappearing when the session is temporarily missing
 *    - Remote requests can surface the auth problem instead of silently saving locally
 *    - A single Google account needing reconnect does not demote healthy accounts
 * 2. If a session exists: Use RemoteEventRepository
 *    - Newly authenticated users persist through the backend even before remembered auth state updates
 * 3. If user has NEVER authenticated: Use LocalEventRepository (IndexedDB)
 *    - Events stored locally until user decides to sign in
 *
 * @param sessionExists - Whether a session currently exists (from session.doesSessionExist())
 */
/**
 * Returns the repository for an explicit source, bypassing session/auth checks.
 * Used by query functions that already carry `source` in their query key, so the
 * fetch target cannot drift from the key.
 */
export const getEventRepositoryBySource = createGetEventRepositoryBySource({
  createLocalEventRepository: () => new LocalEventRepository(),
  createRemoteEventRepository: () => new RemoteEventRepository(),
});
