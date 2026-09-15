import {
  APP_SHORTCUT_BINDINGS,
  EDIT_SEQUENCE_LETTER_FIELDS,
  editSequenceRegistryKeys,
  hotkeyKeycaps,
} from "@web/shortcuts/app-shortcut-bindings";
import { type Shortcut } from "@web/shortcuts/global.shortcut.types";
import { KEYMAP } from "@web/shortcuts/keymap";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";

const B = APP_SHORTCUT_BINDINGS;

/**
 * Shortcut registry: the display source for the `?` legend overlay. Each
 * shortcut has an id, section, label, and optional context predicate; the
 * predicate determines visibility based on app state.
 *
 * Runtime bindings live in {@link KEYMAP} and {@link APP_SHORTCUT_BINDINGS};
 * legend rows derive from those tables so a remap updates behavior and the
 * overlay together.
 */
export const SHORTCUTS_REGISTRY: Shortcut[] = [
  // Navigate - Up Next
  {
    id: "nav-up-next",
    keys: [...B.navUpNext.keycaps],
    label: "Open Up Next event",
    section: "navigate",
  },
  {
    id: "nav-join-meeting",
    keys: [...B.navJoinMeeting.keycaps],
    label: "Join Up Next meeting",
    section: "navigate",
  },

  // Navigate - Life view only
  {
    id: "nav-life-prev",
    keys: [...B.navLifePrevious.keycaps],
    label: "Previous life variation",
    section: "navigate",
    when: { lifeView: true },
  },
  {
    id: "nav-life-next",
    keys: [...B.navLifeNext.keycaps],
    label: "Next life variation",
    section: "navigate",
    when: { lifeView: true },
  },
  {
    id: "nav-life-current",
    keys: [...B.navLifeCurrent.keycaps],
    label: "Focus current week",
    section: "navigate",
    when: { lifeView: true },
  },

  // Navigate - Day/Week views
  {
    id: "nav-previous",
    keys: [...B.navPrevious.keycaps],
    label: "Previous",
    section: "navigate",
  },
  {
    id: "nav-next",
    keys: [...B.navNext.keycaps],
    label: "Next",
    section: "navigate",
  },
  {
    id: "nav-shift-left",
    keys: [...B.navShiftLeft.keycaps],
    label: "Shift view back one day",
    section: "navigate",
  },
  {
    id: "nav-shift-right",
    keys: [...B.navShiftRight.keycaps],
    label: "Shift view forward one day",
    section: "navigate",
  },
  {
    id: "nav-month-prev",
    keys: [...B.navMonthPrev.keycaps],
    label: "Previous month in picker",
    section: "navigate",
  },
  {
    id: "nav-month-next",
    keys: [...B.navMonthNext.keycaps],
    label: "Next month in picker",
    section: "navigate",
  },
  {
    id: "nav-picker-step",
    keys: [...KEYMAP.moveFocus.keycaps],
    label: "Move the month picker by a week (Enter opens it)",
    section: "navigate",
  },
  {
    id: "nav-today",
    keys: [...B.navToday.keycaps],
    label: "Go to today",
    section: "navigate",
  },
  {
    id: "nav-scroll-up",
    keys: [...B.navScrollUp.keycaps],
    label: "Scroll grid up",
    section: "navigate",
  },
  {
    id: "nav-scroll-down",
    keys: [...B.navScrollDown.keycaps],
    label: "Scroll grid down",
    section: "navigate",
  },
  {
    id: "nav-scroll-hour-up",
    keys: [...B.navScrollHourUp.keycaps],
    label: "Scroll grid up one hour",
    section: "navigate",
  },
  {
    id: "nav-scroll-hour-down",
    keys: [...B.navScrollHourDown.keycaps],
    label: "Scroll grid down one hour",
    section: "navigate",
  },

  // Navigate - View switchers (all views)
  {
    id: "nav-day-view",
    keys: [...B.navDayView.keycaps],
    label: "Go to Day view",
    section: "navigate",
  },
  {
    id: "nav-week-view",
    keys: [...B.navWeekView.keycaps],
    label: "Go to Week view",
    section: "navigate",
  },
  {
    id: "nav-life-view",
    keys: [...B.navLifeView.keycaps],
    label: "Go to Life view",
    section: "navigate",
  },

  // Create
  {
    id: "create-timed",
    keys: [KEYMAP.createEvent.hotkey.toLowerCase()],
    label: "Create timed event",
    section: "create",
    requiresWrite: true,
  },
  {
    id: "create-allday",
    keys: [...B.createAllDay.keycaps],
    label: "Create all-day event",
    section: "create",
    requiresWrite: true,
  },
  {
    id: "create-place-timed",
    keys: ["Shift", "Arrow keys"],
    label: "Place timed draft on grid",
    section: "create",
    requiresWrite: true,
  },
  {
    id: "create-typed-time",
    keys: ["1130"],
    label: "Create draft at a typed time (press H to see open slots)",
    section: "create",
    requiresWrite: true,
  },
  {
    id: "create-place-discard",
    keys: [...B.createPlaceDiscard.keycaps],
    label: "Discard placed draft",
    section: "create",
  },

  // Focus
  {
    id: "focus-sidebar",
    keys: [...B.focusSidebar.keycaps],
    label: "Focus month picker",
    section: "focus",
  },
  {
    id: "focus-event",
    keys: [...B.focusEvent.keycaps],
    label: "Focus calendar event",
    section: "focus",
  },
  {
    id: "focus-shift-hold",
    keys: [KEYMAP.eventJump.bareLetter],
    label: "Toggle event jump keys",
    section: "focus",
  },
  {
    id: "focus-week-day",
    keys: [...B.focusWeekDay.keycaps],
    label: "Focus a day's events (Shift + M T W R F, Shift + S then U or A)",
    section: "focus",
  },
  {
    id: "focus-notice",
    keys: [...B.focusNotice.keycaps],
    label: "Focus latest notice",
    section: "focus",
  },
  // One row instead of one per target: the digit assignment lives in
  // page-jump.targets.ts, and in-the-moment discovery is the hold-Mod hint
  // overlay's job (mirrors edit-jump-field-digit below).
  {
    id: "focus-page-jump",
    keys: [...KEYMAP.jumpPageTarget.keycaps],
    label: "Jump to a page area (hold Mod for hints)",
    section: "focus",
  },
  {
    id: "focus-find-event",
    keys: [...KEYMAP.commandPalette.keycaps],
    label: "Find an event by title",
    section: "focus",
  },

  // Edit
  {
    id: "edit-open",
    keys: [...B.editOpen.keycaps],
    label: "Open focused event",
    section: "edit",
  },
  // Generated from the behavioral source of truth, so the legend cannot drift
  // from what the keys actually do. Listed unconditionally: the legend is a
  // reference, and gating these on live DOM focus made them vanish the moment
  // the legend took focus to open. In-the-moment discovery is the which-key
  // menu's job instead.
  ...EDIT_SEQUENCE_LETTER_FIELDS.map(({ field, key, label }) => ({
    id: `edit-focus-${field}`,
    keys: editSequenceRegistryKeys(key),
    label: `Edit ${label.toLowerCase()}`,
    section: "edit",
    requiresWrite: true,
  })),
  {
    id: "edit-delete",
    keys: [...B.editDelete.keycaps],
    label: "Delete focused event",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-duplicate",
    keys: [...B.editDuplicate.keycaps],
    label: "Duplicate focused event",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-copy",
    keys: [...B.editCopy.keycaps],
    label: "Copy focused event",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-paste",
    keys: [...B.editPaste.keycaps],
    label: "Paste copied event",
    section: "edit",
    requiresWrite: true,
  },
  {
    // Shift+F10 also opens this menu on platforms that have a context-menu key
    // (the browser turns it into a contextmenu event). It is deliberately not
    // listed here: it would be a second row
    // with this exact label, and m already teaches the capability.
    id: "edit-menu",
    keys: [...B.editMenu.keycaps],
    label: "Open event menu",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-hide",
    keys: [...B.editHide.keycaps],
    label: "Hide or show focused event",
    section: "edit",
  },
  {
    id: "edit-save",
    keys: [...B.editSave.keycaps],
    label: "Save event form",
    section: "edit",
    when: { isFormOpen: true },
    requiresWrite: true,
  },
  // One row instead of seven duplicates of the rows above: `Mod+E` is the same
  // leader, for when the caret is already in a field and a bare `e` would type.
  {
    id: "edit-field-leader-in-form",
    keys: [...B.editFieldLeaderInForm.keycaps],
    label: "Same field jumps while typing",
    section: "edit",
    when: { isFormOpen: true },
    requiresWrite: true,
  },
  // One row instead of eight duplicates: the digit assignment is the same
  // table as edit-focus-* above (just numbered instead of lettered), and
  // in-the-moment discovery is the hold-Mod hint overlay's job.
  {
    id: "edit-jump-field-digit",
    keys: [...KEYMAP.jumpFormField.keycaps],
    label: "Jump to form field or actions (hold Mod for hints)",
    section: "edit",
    when: { isFormOpen: true },
    requiresWrite: true,
  },
  // Called out separately from the digit row above: the actions toolbar is
  // the one jump target that isn't a field, and it's the only place Duplicate
  // and Delete are visible.
  {
    id: "edit-form-actions",
    keys: [...B.editFormActions.keycaps],
    label: "Jump to event actions",
    section: "edit",
    when: { isFormOpen: true },
    requiresWrite: true,
  },
  // Not form-gated: the same digit pick also runs in the event context
  // menu's color swatch strip, independent of whether the form is open.
  {
    id: "edit-pick-by-number",
    keys: ["1-9", "0", "-", "="],
    label: "Pick focused color or calendar",
    section: "edit",
    requiresWrite: true,
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
    requiresWrite: true,
  },
  {
    id: "edit-move-prev-day",
    keys: hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.left),
    label: "Move event to previous day",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-move-next-day",
    keys: hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.right),
    label: "Move event to next day",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-move-earlier",
    keys: hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.up),
    label: "Move event 15 min earlier",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-move-later",
    keys: hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.down),
    label: "Move event 15 min later",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-cycle-edge",
    keys: [KEYMAP.edgeFocus.hotkey],
    label: "Cycle start/end edge focus",
    section: "edit",
    requiresWrite: true,
  },
  {
    id: "edit-move-edge",
    keys: ["Shift", "Arrow keys"],
    label: "Move only the focused edge",
    section: "edit",
    requiresWrite: true,
  },

  // Other
  {
    id: "other-sidebar",
    keys: [...B.otherSidebar.keycaps],
    label: "Toggle sidebar",
    section: "other",
  },
  {
    id: "other-shortcuts",
    keys: [...B.otherShortcuts.keycaps],
    label: "Toggle shortcuts",
    section: "other",
  },
  {
    id: "other-palette",
    keys: [...KEYMAP.commandPalette.keycaps],
    label: "Command Palette",
    section: "other",
  },
  {
    id: "other-subscribe",
    keys: [...B.otherSubscribe.keycaps],
    label: "Subscribe now",
    section: "other",
    when: { isTrialing: true },
  },
  {
    id: "other-settings",
    keys: [...B.otherSettings.keycaps],
    label: "Settings",
    section: "other",
  },
  {
    id: "other-undo",
    keys: hotkeyKeycaps(KEYMAP.undo.hotkey),
    label: "Undo last change",
    section: "other",
    requiresWrite: true,
  },
  {
    id: "other-redo",
    keys: hotkeyKeycaps(KEYMAP.redo.hotkey),
    label: "Redo last change",
    section: "other",
    requiresWrite: true,
  },
  {
    id: "other-time-travel",
    keys: [...B.otherTimeTravel.keycaps],
    label: "Time travel",
    section: "other",
  },
];

interface FilterOptions {
  view: "day" | "week" | "life";
  isViewingCurrentPeriod: boolean;
  isFormOpen?: boolean;
  isTrialing?: boolean;
}

// Context-sensitive display labels, keyed by shortcut id. Each override lives
// here, next to the registry, instead of in a branch chain.
const LABEL_OVERRIDES: Record<string, (options: FilterOptions) => string> = {
  "nav-previous": ({ view }) => `Previous ${view}`,
  "nav-next": ({ view }) => `Next ${view}`,
  "nav-picker-step": ({ view }) =>
    view === "day"
      ? "Move the month picker by a day (Enter opens it)"
      : "Move the month picker by a week (Enter opens it)",
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
  const { view, isFormOpen, isTrialing } = options;

  return SHORTCUTS_REGISTRY.map((shortcut) => ({
    ...shortcut,
    label: LABEL_OVERRIDES[shortcut.id]?.(options) ?? shortcut.label,
  })).filter((shortcut) => {
    // Filter by view
    if (view === "life") {
      // Life view shows only life-specific navigate + other shortcuts, plus
      // the page jump row: Life mounts its own hold-Mod jump targets, so the
      // gesture is still discoverable there.
      if (shortcut.section === "focus") {
        return (
          shortcut.id === "focus-page-jump" ||
          shortcut.id === "focus-find-event"
        );
      }
      if (shortcut.section === "create" || shortcut.section === "edit") {
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
      if (shortcut.when?.weekView === true && view !== "week") {
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
    if (shortcut.when?.isTrialing && !isTrialing) {
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
