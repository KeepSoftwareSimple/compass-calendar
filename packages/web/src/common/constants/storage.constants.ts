type StorageKey =
  | "compass.auth"
  | "compass.onboarding.has-seen-welcome"
  | "compass.onboarding.has-seen-anonymous-save-toast"
  | "compass.onboarding.has-dismissed-demo-events-banner"
  | "compass.onboarding.has-dismissed-tasks-removal-notice"
  // Set when the host dismisses the sidebar meeting-page nudge. Device-local;
  // turning the page on hides the card everywhere without this key.
  | "compass.onboarding.has-dismissed-meeting-page-nudge"
  // Set when the user finishes or skips the Shortcut Showcase, so it never
  // auto-launches twice (palette replay ignores it).
  | "compass.onboarding.has-seen-shortcut-showcase"
  // Current Shortcut Showcase step id while practice is in progress. Cleared
  // on finish or a confirmed skip so a reload can resume instead of restarting.
  | "compass.onboarding.shortcut-showcase-step"
  // Set when a welcome-modal exit hands off to signup before the showcase;
  // consumed once, right after signup completes, to offer it then.
  | "compass.onboarding.has-pending-showcase-offer"
  // "completed" | "dismissed": the first-event prompt's terminal state.
  // Absent means it is still live (or never shown).
  | "compass.onboarding.first-event-done"
  // Set when a signed-in user dismisses the connect-calendar onboarding step.
  | "compass.onboarding.has-dismissed-connect-calendar-prompt"
  | "compass.shortcuts.tips-muted"
  // Demonstrated sidebar shortcut-tip ids (JSON). Device-local; an unknown
  // id is skipped on read, not an error.
  | "compass.shortcuts.tips-demonstrated"
  // Privacy-safe, device-local shortcut counters and timestamps used to rank
  // eligible sidebar tips without a network read.
  | "compass.shortcuts.personalization"
  | "compass.sidebar.width"
  | "compass.theme"
  | "compass.life.preferences"
  | "compass.view.sidebar-open"
  // S39 A2: client-owned calendar visibility (default visible). Device-local,
  // matching other compass.* prefs — not synced across browsers.
  | "compass.calendars.hidden-ids"
  // Which calendar new events are created on. Device-local like the rest;
  // an unknown or stale id falls back to the derived default.
  | "compass.calendars.default-id"
  // Which accounts' calendar rows are collapsed in the sidebar. Device-local;
  // an unknown or stale key falls back to expanded (default).
  | "compass.calendars.collapsed-accounts"
  // Recently-used command palette item ids, most recent first. Device-local;
  // an id that no longer resolves to a visible item is skipped, not an error.
  | "compass.commands.recent"
  // Pinned calendar timezone. Absent means Auto (follow the browser).
  | "compass.timezone.default"
  // Secondary time-travel zone. Absent means the extra hour column is off.
  | "compass.timezone.time-travel"
  // Browser IANA id the pin-mismatch banner is snoozed for. Absent means the
  // banner can show. It returns when the browser zone no longer matches.
  | "compass.timezone.mismatch-snoozed-browser"
  // Device-local opt-in for upcoming-event browser notifications. Only ever
  // written "true" right after the browser grants permission, so a stale flag
  // can never outlive a revoked grant (the permission is re-read on load).
  | "compass.notifications.enabled"
  // Keyboard-only hint guardrails (lifetime cap, permanent dismiss, spacing).
  | "compass.pointer-hint.lifetime-count"
  | "compass.pointer-hint.dismissed-permanently"
  | "compass.pointer-hint.last-shown-at";

export const STORAGE_KEYS: Record<
  | "AUTH"
  | "HAS_SEEN_WELCOME"
  | "HAS_SEEN_ANONYMOUS_SAVE_TOAST"
  | "HAS_DISMISSED_DEMO_EVENTS_BANNER"
  | "HAS_DISMISSED_TASKS_REMOVAL_NOTICE"
  | "HAS_DISMISSED_MEETING_PAGE_NUDGE"
  | "HAS_SEEN_SHORTCUT_SHOWCASE"
  | "SHORTCUT_SHOWCASE_STEP"
  | "HAS_PENDING_SHOWCASE_OFFER"
  | "FIRST_EVENT_DONE"
  | "HAS_DISMISSED_CONNECT_CALENDAR_PROMPT"
  | "SHORTCUT_TIPS_MUTED"
  | "SHORTCUT_TIPS_DEMONSTRATED"
  | "SHORTCUT_PERSONALIZATION"
  | "LIFE_PREFERENCES"
  | "SIDEBAR_WIDTH"
  | "SIDEBAR_OPEN"
  | "THEME"
  | "HIDDEN_CALENDAR_IDS"
  | "DEFAULT_CALENDAR_ID"
  | "COLLAPSED_ACCOUNTS"
  | "RECENT_COMMANDS"
  | "DEFAULT_TIMEZONE"
  | "TIME_TRAVEL_TIMEZONE"
  | "TIMEZONE_MISMATCH_SNOOZED_BROWSER"
  | "NOTIFICATIONS_ENABLED"
  | "POINTER_HINT_LIFETIME_COUNT"
  | "POINTER_HINT_DISMISSED_PERMANENTLY"
  | "POINTER_HINT_LAST_SHOWN_AT",
  StorageKey
> = {
  AUTH: "compass.auth",
  HAS_SEEN_WELCOME: "compass.onboarding.has-seen-welcome",
  HAS_SEEN_ANONYMOUS_SAVE_TOAST:
    "compass.onboarding.has-seen-anonymous-save-toast",
  HAS_DISMISSED_DEMO_EVENTS_BANNER:
    "compass.onboarding.has-dismissed-demo-events-banner",
  HAS_DISMISSED_TASKS_REMOVAL_NOTICE:
    "compass.onboarding.has-dismissed-tasks-removal-notice",
  HAS_DISMISSED_MEETING_PAGE_NUDGE:
    "compass.onboarding.has-dismissed-meeting-page-nudge",
  HAS_SEEN_SHORTCUT_SHOWCASE: "compass.onboarding.has-seen-shortcut-showcase",
  SHORTCUT_SHOWCASE_STEP: "compass.onboarding.shortcut-showcase-step",
  HAS_PENDING_SHOWCASE_OFFER: "compass.onboarding.has-pending-showcase-offer",
  FIRST_EVENT_DONE: "compass.onboarding.first-event-done",
  HAS_DISMISSED_CONNECT_CALENDAR_PROMPT:
    "compass.onboarding.has-dismissed-connect-calendar-prompt",
  SHORTCUT_TIPS_MUTED: "compass.shortcuts.tips-muted",
  SHORTCUT_TIPS_DEMONSTRATED: "compass.shortcuts.tips-demonstrated",
  SHORTCUT_PERSONALIZATION: "compass.shortcuts.personalization",
  LIFE_PREFERENCES: "compass.life.preferences",
  SIDEBAR_WIDTH: "compass.sidebar.width",
  SIDEBAR_OPEN: "compass.view.sidebar-open",
  THEME: "compass.theme",
  HIDDEN_CALENDAR_IDS: "compass.calendars.hidden-ids",
  DEFAULT_CALENDAR_ID: "compass.calendars.default-id",
  COLLAPSED_ACCOUNTS: "compass.calendars.collapsed-accounts",
  RECENT_COMMANDS: "compass.commands.recent",
  DEFAULT_TIMEZONE: "compass.timezone.default",
  TIME_TRAVEL_TIMEZONE: "compass.timezone.time-travel",
  TIMEZONE_MISMATCH_SNOOZED_BROWSER:
    "compass.timezone.mismatch-snoozed-browser",
  NOTIFICATIONS_ENABLED: "compass.notifications.enabled",
  POINTER_HINT_LIFETIME_COUNT: "compass.pointer-hint.lifetime-count",
  POINTER_HINT_DISMISSED_PERMANENTLY:
    "compass.pointer-hint.dismissed-permanently",
  POINTER_HINT_LAST_SHOWN_AT: "compass.pointer-hint.last-shown-at",
} as const;
