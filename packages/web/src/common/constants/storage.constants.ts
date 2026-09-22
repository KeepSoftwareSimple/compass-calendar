/**
 * Every browser-storage key the web app owns, in one place.
 *
 * The `compass.` prefix is load-bearing, not cosmetic: sign-out clears storage
 * by matching it (browser.cleanup.util.ts), so the `satisfies` below rejects an
 * unprefixed key at compile time. `StorageKey` and the key names are both
 * derived from this object, so adding a key means editing one line.
 */
export const STORAGE_KEYS = {
  AUTH: "compass.auth",
  HAS_SEEN_WELCOME: "compass.onboarding.has-seen-welcome",
  HAS_SEEN_ANONYMOUS_SAVE_TOAST:
    "compass.onboarding.has-seen-anonymous-save-toast",
  HAS_DISMISSED_DEMO_EVENTS_BANNER:
    "compass.onboarding.has-dismissed-demo-events-banner",
  HAS_DISMISSED_TASKS_REMOVAL_NOTICE:
    "compass.onboarding.has-dismissed-tasks-removal-notice",
  // Set when the host dismisses the sidebar meeting-page nudge. Device-local;
  // turning the page on hides the card everywhere without this key.
  HAS_DISMISSED_MEETING_PAGE_NUDGE:
    "compass.onboarding.has-dismissed-meeting-page-nudge",
  // Set when the user finishes or skips the Shortcut Showcase, so it never
  // auto-launches twice (palette replay ignores it).
  HAS_SEEN_SHORTCUT_SHOWCASE: "compass.onboarding.has-seen-shortcut-showcase",
  // Current Shortcut Showcase step id while practice is in progress. Cleared
  // on finish or a confirmed skip so a reload can resume instead of restarting.
  SHORTCUT_SHOWCASE_STEP: "compass.onboarding.shortcut-showcase-step",
  // "completed" | "dismissed": the first-event prompt's terminal state.
  // Absent means it is still live (or never shown).
  FIRST_EVENT_DONE: "compass.onboarding.first-event-done",
  // Set when a signed-in user dismisses the connect-calendar onboarding step.
  // Holds an epoch-ms timestamp. Older browsers hold the literal "true" from
  // when dismissing was permanent; the reader treats that as a lapsed snooze.
  CONNECT_CALENDAR_PROMPT_SNOOZED_AT:
    "compass.onboarding.has-dismissed-connect-calendar-prompt",
  SHORTCUT_TIPS_MUTED: "compass.shortcuts.tips-muted",
  // Demonstrated sidebar shortcut-tip ids (JSON). Device-local; an unknown
  // id is skipped on read, not an error.
  SHORTCUT_TIPS_DEMONSTRATED: "compass.shortcuts.tips-demonstrated",
  // Privacy-safe, device-local shortcut counters and timestamps used to rank
  // eligible sidebar tips without a network read.
  SHORTCUT_PERSONALIZATION: "compass.shortcuts.personalization",
  LIFE_PREFERENCES: "compass.life.preferences",
  SIDEBAR_WIDTH: "compass.sidebar.width",
  SIDEBAR_OPEN: "compass.view.sidebar-open",
  THEME: "compass.theme",
  // S39 A2: client-owned calendar visibility (default visible). Device-local,
  // matching other compass.* prefs — not synced across browsers.
  HIDDEN_CALENDAR_IDS: "compass.calendars.hidden-ids",
  // Client-owned, device-local, anonymous fallback only. Signed-in users
  // persist hidden event ids on the server.
  HIDDEN_EVENT_IDS: "compass.events.hidden-ids",
  // Which calendar new events are created on. Device-local like the rest;
  // an unknown or stale id falls back to the derived default.
  DEFAULT_CALENDAR_ID: "compass.calendars.default-id",
  // Which accounts' calendar rows are collapsed in the sidebar. Device-local;
  // an unknown or stale key falls back to expanded (default).
  COLLAPSED_ACCOUNTS: "compass.calendars.collapsed-accounts",
  // Recently-used command palette item ids, most recent first. Device-local;
  // an id that no longer resolves to a visible item is skipped, not an error.
  RECENT_COMMANDS: "compass.commands.recent",
  // Pinned calendar timezone. Absent means Auto (follow the browser).
  DEFAULT_TIMEZONE: "compass.timezone.default",
  // Secondary time-travel zone. Absent means the extra hour column is off.
  TIME_TRAVEL_TIMEZONE: "compass.timezone.time-travel",
  // Browser IANA id the pin-mismatch banner is snoozed for. Absent means the
  // banner can show. It returns when the browser zone no longer matches.
  TIMEZONE_MISMATCH_SNOOZED_BROWSER:
    "compass.timezone.mismatch-snoozed-browser",
  // Device-local opt-in for upcoming-event browser notifications. Only ever
  // written "true" right after the browser grants permission, so a stale flag
  // can never outlive a revoked grant (the permission is re-read on load).
  NOTIFICATIONS_ENABLED: "compass.notifications.enabled",
  // ISO trial end the user dismissed the trial card banner for. A new trial end
  // shows the banner again.
  TRIAL_CARD_BANNER_DISMISSED_FOR:
    "compass.billing.trial-card-banner-dismissed-for",
  // The X on the keyboard hint turns tips off for this browser.
  POINTER_HINT_DISMISSED_PERMANENTLY:
    "compass.pointer-hint.dismissed-permanently",
} as const satisfies Record<string, `compass.${string}`>;
