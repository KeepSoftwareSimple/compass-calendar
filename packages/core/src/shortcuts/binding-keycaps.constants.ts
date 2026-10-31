/**
 * Month-picker month jump: J/K match grid period nav (J back, K forward).
 * Mod+Alt keeps a three-key chord that still fires in inputs; the web app
 * calls preventDefault so browser DevTools/console shortcuts do not win.
 */
export const MONTH_PICKER_PREV_HOTKEY = "Mod+Alt+J" as const;
export const MONTH_PICKER_NEXT_HOTKEY = "Mod+Alt+K" as const;
export const MONTH_PICKER_CURRENT_HOTKEY = "Mod+Alt+T" as const;

export const MONTH_PICKER_PREV_KEYCAPS = ["Mod", "Alt", "j"] as const;
export const MONTH_PICKER_NEXT_KEYCAPS = ["Mod", "Alt", "k"] as const;
export const MONTH_PICKER_CURRENT_KEYCAPS = ["Mod", "Alt", "t"] as const;

/** Toggle all-day on the open event form; same Mod+Alt family as month jumps. */
export const EVENT_FORM_TOGGLE_ALL_DAY_HOTKEY = "Mod+Alt+A" as const;
export const EVENT_FORM_TOGGLE_ALL_DAY_KEYCAPS = ["Mod", "Alt", "a"] as const;

/** Max keycaps in a single modifier chord shown in the legend (Mod/Alt/Shift + key). */
export const MOD_CHORD_MAX_KEYCAPS = 3 as const;

/** Opens the focused event's context menu. `.` keeps bare `m` for Monday jumps. */
export const EVENT_MENU_LETTER = ".";
/** Sidebar meeting-page nudge CTA. `/` matches meet URLs; frees `m` for Monday. */
export const MEETING_PAGE_NUDGE_LETTER = "/";
export const HIDE_EVENT_LETTER = "x";
export const FOCUS_NOTICE_LETTER = "p";

export const VIEW_SHORTCUT_KEYS = {
  day: "d",
  week: "w",
  life: "l",
} as const;
