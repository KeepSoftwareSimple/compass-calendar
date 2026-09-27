import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { readIdList, writeIdList } from "@web/common/storage/json-value.store";

export const MAX_RECENT_COMMANDS = 8;

// Most-recent-first list of command ids. Malformed or missing storage falls
// back to an empty list rather than surfacing an error.
export function readRecentCommandIds(): readonly string[] {
  return readIdList(STORAGE_KEYS.RECENT_COMMANDS);
}

/** Callers are responsible for capping — this writes exactly what it's given. */
export function writeRecentCommandIds(ids: readonly string[]): boolean {
  return writeIdList(STORAGE_KEYS.RECENT_COMMANDS, ids);
}
