type StorageKey =
  | "compass.auth"
  | "compass.onboarding.has-seen-welcome"
  | "compass.onboarding.has-seen-anonymous-save-toast"
  | "compass.onboarding.has-dismissed-demo-events-banner"
  | "compass.onboarding.has-dismissed-tasks-removal-notice"
  // Set when the user finishes or skips the Shortcut Showcase, so it never
  // auto-launches twice (palette replay ignores it).
  | "compass.onboarding.has-seen-shortcut-showcase"
  // Set when a welcome-modal exit hands off to signup before the showcase;
  // consumed once, right after signup completes, to offer it then.
  | "compass.onboarding.has-pending-showcase-offer"
  // "completed" | "dismissed": the first-event prompt's terminal state.
  // Absent means it is still live (or never shown).
  | "compass.onboarding.first-event-done"
  | "compass.trial.started-at"
  | "compass.shortcuts.tips-muted"
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
  | "compass.timezone.time-travel";

export const STORAGE_KEYS: Record<
  | "AUTH"
  | "HAS_SEEN_WELCOME"
  | "HAS_SEEN_ANONYMOUS_SAVE_TOAST"
  | "HAS_DISMISSED_DEMO_EVENTS_BANNER"
  | "HAS_DISMISSED_TASKS_REMOVAL_NOTICE"
  | "HAS_SEEN_SHORTCUT_SHOWCASE"
  | "HAS_PENDING_SHOWCASE_OFFER"
  | "FIRST_EVENT_DONE"
  | "TRIAL_STARTED_AT"
  | "SHORTCUT_TIPS_MUTED"
  | "LIFE_PREFERENCES"
  | "SIDEBAR_WIDTH"
  | "SIDEBAR_OPEN"
  | "THEME"
  | "HIDDEN_CALENDAR_IDS"
  | "DEFAULT_CALENDAR_ID"
  | "COLLAPSED_ACCOUNTS"
  | "RECENT_COMMANDS"
  | "DEFAULT_TIMEZONE"
  | "TIME_TRAVEL_TIMEZONE",
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
  HAS_SEEN_SHORTCUT_SHOWCASE: "compass.onboarding.has-seen-shortcut-showcase",
  HAS_PENDING_SHOWCASE_OFFER: "compass.onboarding.has-pending-showcase-offer",
  FIRST_EVENT_DONE: "compass.onboarding.first-event-done",
  TRIAL_STARTED_AT: "compass.trial.started-at",
  SHORTCUT_TIPS_MUTED: "compass.shortcuts.tips-muted",
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
} as const;
