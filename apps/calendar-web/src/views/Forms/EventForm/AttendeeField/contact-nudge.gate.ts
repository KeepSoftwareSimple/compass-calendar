// Frequency gate for the "Enable contact suggestions" nudge (WP-06).
//
// Product decision 1 (2026-08-25): the nudge is OCCASIONAL and non-nagging.
// Encoded here as two independent rules:
//   1. At most once per app session — after one showing, every later menu
//      open in this session stays nudge-free.
//   2. Dismissal is forever — an explicit dismiss persists to localStorage
//      and no future session shows the nudge again.
// Over-showing is a regression; both rules are pinned by tests.

const DISMISSED_STORAGE_KEY = "compass.contactsNudge.dismissed";

let shownThisSession = false;

function isDismissedForever(): boolean {
  try {
    return localStorage.getItem(DISMISSED_STORAGE_KEY) === "true";
  } catch {
    // Storage unavailable (private mode, quota): fail toward showing less
    // is not required — the per-session flag still bounds it to one showing.
    return false;
  }
}

export function shouldShowContactsNudge(): boolean {
  return !shownThisSession && !isDismissedForever();
}

/** One showing consumed — no further nudge this session. */
export function markContactsNudgeShown(): void {
  shownThisSession = true;
}

/** Explicit dismiss: never show again, in this or any future session. */
export function dismissContactsNudge(): void {
  shownThisSession = true;
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
  } catch {
    // Best effort — the session flag still silences the rest of this session.
  }
}

/** Test-only: reset the per-session flag (localStorage is the test's own). */
export function resetContactsNudgeSessionForTests(): void {
  shownThisSession = false;
}
