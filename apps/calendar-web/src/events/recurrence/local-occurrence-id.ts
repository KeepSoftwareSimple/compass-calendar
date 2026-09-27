import { type EventId } from "@core/types/domain-primitives";

// Deterministic occurrence ids (`${seriesId}::${start}`) keep repeated
// projections idempotent and give LOCAL (IndexedDB) mode stable ids across
// refetches. Local-mode only: these ids never reach the sync API, so they
// split on the LAST "::" (a this-and-following split creates a series whose
// own id is already composed, so its occurrences nest another segment) and
// never need to match the server's own occurrence-id codec. Remote-facing
// optimistic ids use composeOccurrenceIdFromSchedule (from @core) instead,
// which is byte-identical to what sync's projection will mint.
export function composeLocalOccurrenceId(
  seriesId: string,
  start: string,
): EventId {
  return `${seriesId}::${start}` as EventId;
}

// Split at the LAST "::": a this-and-following split creates a series whose
// own id is already composed, so its occurrences nest another segment.
export function parseLocalOccurrenceId(
  id: string,
): { seriesId: EventId; start: string } | null {
  const separator = id.lastIndexOf("::");
  if (separator <= 0 || separator + 2 >= id.length) return null;
  return {
    seriesId: id.slice(0, separator) as EventId,
    start: id.slice(separator + 2),
  };
}
