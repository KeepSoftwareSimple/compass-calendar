import { EDIT_SEQUENCE_FIELDS } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { type Shortcut } from "@web/shortcuts/global.shortcut.types";
import { KEYMAP } from "@web/shortcuts/keymap";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";

// Display keycaps for a tanstack hotkey string ("Mod+Shift+Z" -> ["Mod",
// "Shift", "Z"]), so registry rows derive from the runtime binding instead of
// hand-copying it.
const caps = (hotkey: string): string[] => hotkey.split("+");

/**
 * Shortcut registry: the display source for the `?` legend overlay. Each
 * shortcut has an id, section, label, and optional context predicate; the
 * predicate determines visibility based on app state.
 *
 * Runtime bindings live at the handler sites; rows for bindings that
 * `keymap.ts` owns derive their keys from KEYMAP, so a remap there updates
 * the legend by construction.
 */
export const SHORTCUTS_REGISTRY: Shortcut[] = [
  // Navigate - Up Next
  {
    id: "nav-up-next",
    keys: ["n"],
    label: "Open Up Next event",
    section: "navigate",
  },
  {
    id: "nav-join-meeting",
    keys: ["v"],
    label: "Join Up Next meeting",
    section: "navigate",
  },

  // Navigate - Life view only
  {
    id: "nav-life-prev",
    keys: ["j"],
    label: "Previous life variation",
    section: "navigate",
    when: { lifeView: true },
  },
  {
    id: "nav-life-next",
    keys: ["k"],
    label: "Next life variation",
    section: "navigate",
    when: { lifeView: true },
  },
  {
    id: "nav-life-current",
    keys: ["t"],
    label: "Focus current week",
    section: "navigate",
    when: { lifeView: true },
  },

  // Navigate - Day/Week views
  {
    id: "nav-previous",
    keys: ["j"],
    label: "Previous",
    section: "navigate",
  },
  {
    id: "nav-next",
    keys: ["k"],
    label: "Next",
    section: "navigate",
  },
  {
    id: "nav-shift-left",
    keys: ["Shift", "j"],
    label: "Shift view back one day",
    section: "navigate",
  },
  {
    id: "nav-shift-right",
    keys: ["Shift", "k"],
    label: "Shift view forward one day",
    section: "navigate",
  },
  {
    id: "nav-today",
    keys: ["t"],
    label: "Go to today",
    section: "navigate",
  },
  {
    id: "nav-scroll-up",
    keys: ["PageUp"],
    label: "Scroll grid up",
    section: "navigate",
  },
  {
    id: "nav-scroll-down",
    keys: ["PageDown"],
    label: "Scroll grid down",
    section: "navigate",
  },

  // Navigate - View switchers (all views)
  {
    id: "nav-day-view",
    keys: ["d"],
    label: "Go to Day view",
    section: "navigate",
  },
  {
    id: "nav-week-view",
    keys: ["w"],
    label: "Go to Week view",
    section: "navigate",
  },
  {
    id: "nav-life-view",
    keys: ["l"],
    label: "Go to Life view",
    section: "navigate",
  },

  // Create
  {
    id: "create-timed",
    keys: [KEYMAP.createEvent.hotkey.toLowerCase()],
    label: "Create timed event",
    section: "create",
  },
  {
    id: "create-allday",
    keys: ["a"],
    label: "Create all-day event",
    section: "create",
  },
  {
    id: "create-place-timed",
    keys: ["Shift", "Arrow keys"],
    label: "Place timed draft on grid",
    section: "create",
  },
  {
    id: "create-place-discard",
    keys: ["Escape"],
    label: "Discard placed draft",
    section: "create",
  },

  // Focus
  {
    id: "focus-sidebar",
    keys: ["i"],
    label: "Focus sidebar",
    section: "focus",
  },
  {
    id: "focus-event",
    keys: ["u"],
    label: "Focus calendar event",
    section: "focus",
  },
  {
    id: "focus-shift-hold",
    keys: [KEYMAP.eventJump.bareLetter],
    label: "Toggle event jump keys",
    section: "focus",
  },

  // Edit
  {
    id: "edit-open",
    keys: ["Enter"],
    label: "Open focused event",
    section: "edit",
  },
  // Generated from the behavioral source of truth, so the legend cannot drift
  // from what the keys actually do. Listed unconditionally: the legend is a
  // reference, and gating these on live DOM focus made them vanish the moment
  // the legend took focus to open. In-the-moment discovery is the which-key
  // menu's job instead.
  ...EDIT_SEQUENCE_FIELDS.map(({ field, key, label }) => ({
    id: `edit-focus-${field}`,
    keys: ["e", key],
    label: `Edit ${label.toLowerCase()}`,
    section: "edit",
  })),
  {
    id: "edit-delete",
    keys: ["Delete"],
    label: "Delete focused event",
    section: "edit",
  },
  {
    id: "edit-duplicate",
    keys: ["Mod", "D"],
    label: "Duplicate focused event",
    section: "edit",
  },
  {
    id: "edit-save",
    keys: ["Mod", "Enter"],
    label: "Save event form",
    section: "edit",
    when: { isFormOpen: true },
  },
  // One row instead of seven duplicates of the rows above: `Mod+E` is the same
  // leader, for when the caret is already in a field and a bare `e` would type.
  {
    id: "edit-field-leader-in-form",
    keys: ["Mod+E"],
    label: "Same field jumps while typing",
    section: "edit",
    when: { isFormOpen: true },
  },
  {
    id: "edit-focus-prev",
    keys: [KEYMAP.moveFocus.hotkeys.up],
    label: "Focus previous event",
    section: "edit",
  },
  {
    id: "edit-focus-next",
    keys: [KEYMAP.moveFocus.hotkeys.down],
    label: "Focus next event",
    section: "edit",
  },
  {
    id: "edit-focus-left",
    keys: [KEYMAP.moveFocus.hotkeys.left],
    label: "Focus event on previous day",
    section: "edit",
  },
  {
    id: "edit-focus-right",
    keys: [KEYMAP.moveFocus.hotkeys.right],
    label: "Focus event on next day",
    section: "edit",
  },
  {
    id: "edit-move",
    keys: ["Arrow keys"],
    label: "Move draft event",
    section: "edit",
  },
  {
    id: "edit-move-prev-day",
    keys: caps(KEYMAP.moveEvent.hotkeys.left),
    label: "Move event to previous day",
    section: "edit",
  },
  {
    id: "edit-move-next-day",
    keys: caps(KEYMAP.moveEvent.hotkeys.right),
    label: "Move event to next day",
    section: "edit",
  },
  {
    id: "edit-move-earlier",
    keys: caps(KEYMAP.moveEvent.hotkeys.up),
    label: "Move event 15 min earlier",
    section: "edit",
  },
  {
    id: "edit-move-later",
    keys: caps(KEYMAP.moveEvent.hotkeys.down),
    label: "Move event 15 min later",
    section: "edit",
  },
  {
    id: "edit-cycle-edge",
    keys: [KEYMAP.edgeFocus.hotkey],
    label: "Cycle start/end edge focus",
    section: "edit",
  },
  {
    id: "edit-move-edge",
    keys: ["Shift", "Arrow keys"],
    label: "Move only the focused edge",
    section: "edit",
  },

  // Other
  {
    id: "other-sidebar",
    keys: ["]"],
    label: "Toggle sidebar",
    section: "other",
  },
  {
    id: "other-shortcuts",
    keys: ["?"],
    label: "Toggle shortcuts",
    section: "other",
  },
  {
    id: "other-palette",
    keys: ["Mod", "k"],
    label: "Command Palette",
    section: "other",
  },
  {
    id: "other-settings",
    keys: ["Mod", ","],
    label: "Settings",
    section: "other",
  },
  {
    id: "other-undo",
    keys: caps(KEYMAP.undo.hotkey),
    label: "Undo last change",
    section: "other",
  },
  {
    id: "other-redo",
    keys: caps(KEYMAP.redo.hotkey),
    label: "Redo last change",
    section: "other",
  },
  {
    id: "other-keyboard-only",
    keys: [KEYMAP.hardcore.bareLetter],
    label: "Toggle Hardcore Mode",
    section: "other",
  },
  {
    id: "other-time-travel",
    keys: ["z"],
    label: "Time travel",
    section: "other",
  },
];

interface FilterOptions {
  view: "day" | "week" | "life";
  isViewingCurrentPeriod: boolean;
  isFormOpen?: boolean;
}

// Context-sensitive display labels, keyed by shortcut id. Each override lives
// here, next to the registry, instead of in a branch chain.
const LABEL_OVERRIDES: Record<string, (options: FilterOptions) => string> = {
  "nav-previous": ({ view }) => `Previous ${view}`,
  "nav-next": ({ view }) => `Next ${view}`,
  "nav-today": ({ view, isViewingCurrentPeriod }) => {
    if (isViewingCurrentPeriod) return "Scroll to now";
    return view === "week" ? "Go to current week" : "Go to today";
  },
  "edit-focus-prev": ({ view }) =>
    view === "week" ? "Focus previous event on day" : "Focus previous event",
  "edit-focus-next": ({ view }) =>
    view === "week" ? "Focus next event on day" : "Focus next event",
  "edit-focus-left": ({ view }) =>
    view === "day" ? "Focus previous event" : "Focus event on previous day",
  "edit-focus-right": ({ view }) =>
    view === "day" ? "Focus next event" : "Focus event on next day",
};

/**
 * Filter shortcuts based on context. Returns a new list of shortcuts that should
 * be visible given the current app state, with view-appropriate labels.
 */
export const filterShortcutsByContext = (
  options: FilterOptions,
): Shortcut[] => {
  const { view, isFormOpen } = options;

  return SHORTCUTS_REGISTRY.map((shortcut) => ({
    ...shortcut,
    label: LABEL_OVERRIDES[shortcut.id]?.(options) ?? shortcut.label,
  })).filter((shortcut) => {
    // Filter by view
    if (view === "life") {
      // Life view shows only life-specific navigate + other shortcuts
      if (
        shortcut.section === "create" ||
        shortcut.section === "focus" ||
        shortcut.section === "edit"
      ) {
        return false;
      }
      // Include navigate shortcuts only if life-specific or view switchers
      if (shortcut.section === "navigate") {
        return (
          shortcut.when?.lifeView === true ||
          shortcut.id === "nav-day-view" ||
          shortcut.id === "nav-week-view"
        );
      }
      if (shortcut.id === "other-time-travel") {
        return false;
      }
    } else {
      // Day/week view excludes life-specific shortcuts
      if (shortcut.when?.lifeView === true) {
        return false;
      }
      // Exclude current view switcher (show only alternate view)
      if (
        (view === "day" && shortcut.id === "nav-day-view") ||
        (view === "week" && shortcut.id === "nav-week-view")
      ) {
        return false;
      }
      // Week view includes shift shortcuts, day view should filter them
      if (
        view === "day" &&
        (shortcut.id === "nav-shift-left" || shortcut.id === "nav-shift-right")
      ) {
        return false;
      }
    }

    // Filter by context predicates
    if (shortcut.when?.isFormOpen && !isFormOpen) {
      return false;
    }

    return true;
  });
};

const SECTION_TITLES: Record<string, string> = {
  navigate: "Navigate",
  create: "Create",
  focus: "Focus",
  edit: "Edit",
  other: "Other",
};

/**
 * Get shortcuts grouped by section, in display order. Used for the legend
 * overlay.
 */
export const getShortcutsBySection = (
  shortcuts: Shortcut[],
): { id: string; title: string; shortcuts: Shortcut[] }[] =>
  Object.entries(SECTION_TITLES)
    .map(([id, title]) => ({
      id,
      title,
      shortcuts: shortcuts.filter((shortcut) => shortcut.section === id),
    }))
    .filter((section) => section.shortcuts.length > 0);

export type ShortcutMenuView = FilterOptions["view"];

/**
 * Shortcut menu sections for the `?` legend overlay: the registry filtered
 * for the current view/state, grouped by section.
 */
export const getShortcutMenuSections = (
  config: FilterOptions,
): ShortcutOverlaySection[] =>
  getShortcutsBySection(filterShortcutsByContext(config));
