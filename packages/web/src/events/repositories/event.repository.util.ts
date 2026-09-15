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
  createGetEventRepositorySource,
  type EventRepositorySource,
} from "./event.repository.factory";
import { type EventRepository } from "./event.repository.types";

/**
 * Determines the repository source (local or remote) based on session and authentication state.
 */
export const getEventRepositorySource = createGetEventRepositorySource({
  hasUserEverAuthenticated,
});

/**
 * Loads the repository for an explicit source, bypassing session/auth checks.
 * Used by query and mutation functions that already carry `source` in their
 * key, so the fetch target cannot drift from the key.
 *
 * Local IndexedDB (and rrule via series expansion) stay off the boot graph:
 * await this from mutationFn / queryFn, never at render.
 */
export async function loadEventRepositoryBySource(
  source: EventRepositorySource,
): Promise<EventRepository> {
  if (source === "remote") {
    const { RemoteEventRepository } = await import("./remote.event.repository");
    return new RemoteEventRepository();
  }
  const { LocalEventRepository } = await import("./local.event.repository");
  return new LocalEventRepository();
}
