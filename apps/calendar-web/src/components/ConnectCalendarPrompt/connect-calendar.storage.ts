import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

/**
 * How long "I'll set this up later" holds. Long enough not to nag, short
 * enough that someone who signed up without connecting gets a few more
 * chances in their first month.
 */
export const CONNECT_CALENDAR_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function isConnectCalendarPromptSnoozed(now = Date.now()): boolean {
  if (!persistentBrowserStore.isAvailable()) return false;

  const raw = persistentBrowserStore.get(
    STORAGE_KEYS.CONNECT_CALENDAR_PROMPT_SNOOZED_AT,
  );
  // Must come before the Number() below: Number("") is 0, which would read as
  // a snooze set in 1970 and hide the prompt forever.
  if (!raw) return false;

  const snoozedAt = Number(raw);
  // The literal "true" this key used to hold, back when dismissing was
  // permanent, parses to NaN. Treat it as a lapsed snooze: those users are
  // exactly the ones this is for.
  if (!Number.isFinite(snoozedAt)) return false;

  return now - snoozedAt < CONNECT_CALENDAR_SNOOZE_MS;
}

export function markConnectCalendarPromptSnoozed(now = Date.now()): void {
  persistentBrowserStore.set(
    STORAGE_KEYS.CONNECT_CALENDAR_PROMPT_SNOOZED_AT,
    String(now),
  );
}
