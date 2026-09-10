import { z } from "zod/v4";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

// Collapsed account keys only - absence means expanded (default). A Set of
// `accountKey` strings; unknown or malformed storage (and the email-only keys
// an older build wrote) falls back to expanded rather than hiding every
// account's calendars.
const CollapsedAccountsSchema = z.array(z.string().trim().min(1)).readonly();

export function readCollapsedAccountKeys(): ReadonlySet<string> {
  const raw = persistentBrowserStore.get(STORAGE_KEYS.COLLAPSED_ACCOUNTS);
  if (!raw) return new Set();

  try {
    return new Set(CollapsedAccountsSchema.parse(JSON.parse(raw)));
  } catch {
    return new Set();
  }
}

export function writeCollapsedAccountKeys(keys: ReadonlySet<string>): boolean {
  if (keys.size === 0) {
    return persistentBrowserStore.remove(STORAGE_KEYS.COLLAPSED_ACCOUNTS);
  }
  return persistentBrowserStore.set(
    STORAGE_KEYS.COLLAPSED_ACCOUNTS,
    JSON.stringify([...keys]),
  );
}
