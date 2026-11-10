import { type DateTime, type EventId } from "@core/types/domain-primitives";
import { sha256HexFromUtf8 } from "@core/util/sha256-hex.util";

// A deterministic event id for the remainder series of a thisAndFollowing
// split, so the same split always resolves to the same master and a retry
// never duplicates it. Shared by sync persistence and client optimistic
// occurrence id repointing after a split.
export function remainderMasterId(
  seriesId: EventId,
  splitAt: DateTime,
): EventId {
  return sha256HexFromUtf8(`${seriesId}:${splitAt}`).slice(0, 24) as EventId;
}
