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
import { createGetEventRepositorySource } from "./event.repository.factory";

/**
 * Determines the repository source (local or remote) based on session and authentication state.
 */
export const getEventRepositorySource = createGetEventRepositorySource({
  hasUserEverAuthenticated,
});
