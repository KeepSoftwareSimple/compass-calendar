// How long after a successful FULL calendar-list enumeration before the
// rediscovery sweep may enqueue another one. Google normally learns about list
// changes from push (cursor clear + calendarListSync); Microsoft has no list
// watch, so this sweep is the main background path for new Outlook folders.
export const CALENDAR_LIST_STALE_AFTER_MS = 3 * 60_000;

// How often the sync worker polls for stale calendar lists. Kept shorter than
// the generic ~10m sweep default so idle accounts pick up a new subcalendar
// within a few minutes instead of waiting on the reconcile cadence alone.
export const CALENDAR_LIST_REDISCOVERY_SWEEP_INTERVAL_MS = 2 * 60_000;

// While a principal has an open Compass SSE stream, re-list any connection whose
// last full enumeration is older than this. Pairs with the backend's 15s
// foreground tick (see foreground-sync-refresh.ts).
export const FOREGROUND_CALENDAR_LIST_STALE_AFTER_MS = 60_000;
