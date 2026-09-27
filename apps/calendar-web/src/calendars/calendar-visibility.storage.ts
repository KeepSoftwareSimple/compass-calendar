import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { readIdSet, writeIdSet } from "@web/common/storage/json-value.store";

// Hidden calendar ids only — absence means visible (default). A Set of
// ObjectId-shaped strings; unknown / malformed storage falls back to empty
// (everything visible) rather than locking the user out of every calendar.
export function readHiddenCalendarIds(): ReadonlySet<string> {
  return readIdSet(STORAGE_KEYS.HIDDEN_CALENDAR_IDS);
}

export function writeHiddenCalendarIds(ids: ReadonlySet<string>): boolean {
  return writeIdSet(STORAGE_KEYS.HIDDEN_CALENDAR_IDS, ids);
}

export function setCalendarHidden(
  calendarId: string,
  hidden: boolean,
): boolean {
  const next = new Set(readHiddenCalendarIds());
  if (hidden) next.add(calendarId);
  else next.delete(calendarId);
  return writeHiddenCalendarIds(next);
}

export function isCalendarHidden(calendarId: string): boolean {
  return readHiddenCalendarIds().has(calendarId);
}
