import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { readIdSet, writeIdSet } from "@web/common/storage/json-value.store";

// Collapsed account keys only - absence means expanded (default). A Set of
// `accountKey` strings; unknown or malformed storage (and the email-only keys
// an older build wrote) falls back to expanded rather than hiding every
// account's calendars.
export function readCollapsedAccountKeys(): ReadonlySet<string> {
  return readIdSet(STORAGE_KEYS.COLLAPSED_ACCOUNTS);
}

export function writeCollapsedAccountKeys(keys: ReadonlySet<string>): boolean {
  return writeIdSet(STORAGE_KEYS.COLLAPSED_ACCOUNTS, keys);
}
