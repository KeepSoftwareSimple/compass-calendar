import { type EventRepositorySource } from "./event.repository.factory";
import { type EventRepository } from "./event.repository.types";
import { RemoteEventRepository } from "./remote.event.repository";

/**
 * Loads the repository for an explicit source, bypassing session/auth checks.
 * Used by mutation functions that already carry `source` in their key.
 *
 * Local IndexedDB (and rrule via series expansion) stay off the boot graph:
 * this module is not imported by CompassProvider / RootShell.
 */
export async function loadEventRepositoryBySource(
  source: EventRepositorySource,
): Promise<EventRepository> {
  if (source === "remote") {
    return new RemoteEventRepository();
  }
  const { LocalEventRepository } = await import("./local.event.repository");
  return new LocalEventRepository();
}
