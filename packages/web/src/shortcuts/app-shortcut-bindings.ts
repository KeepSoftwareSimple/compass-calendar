import {
  MONTH_PICKER_NEXT_KEYCAPS,
  MONTH_PICKER_PREV_KEYCAPS,
} from "@web/components/Sidebar/MonthPicker/useMonthPickerShortcuts";
import { EVENT_MENU_LETTER } from "@web/shortcuts/context-menu/useEventContextMenuShortcut";
import { EDIT_SEQUENCE_LETTER_FIELDS } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { HIDE_EVENT_LETTER } from "@web/shortcuts/hide-event/hide-event.constants";
import { KEYMAP } from "@web/shortcuts/keymap";
import { FOCUS_NOTICE_LETTER } from "@web/shortcuts/notice-focus/useFocusNoticeShortcut";
import {
  LIFE_SHORTCUT,
  VIEW_SHORTCUTS,
} from "@web/shortcuts/shortcuts.constants";

/** Lowercase single-letter keycap for the legend overlay. */
const letterKeycap = (hotkey: string) => hotkey.toLowerCase();

/** Split a tanstack hotkey string into legend keycaps ("Mod+Shift+Z" → …). */
export const hotkeyKeycaps = (hotkey: string): string[] => hotkey.split("+");

/**
 * Runtime-owned keyboard bindings for the main calendar shell. Handlers and
 * the shortcuts legend both read from here (and from {@link KEYMAP} for
 * taught flows), so remapping a binding updates behavior and the `?` overlay
 * together.
 */
export const APP_SHORTCUT_BINDINGS = {
  navUpNext: { hotkey: "N", keycaps: [letterKeycap("N")] },
  navJoinMeeting: { hotkey: "V", keycaps: [letterKeycap("V")] },
  navLifePrevious: { hotkey: "J", keycaps: [letterKeycap("J")] },
  navLifeNext: { hotkey: "K", keycaps: [letterKeycap("K")] },
  navLifeCurrent: { hotkey: "T", keycaps: [letterKeycap("T")] },
  navPrevious: { hotkey: "J", keycaps: [letterKeycap("J")] },
  navNext: { hotkey: "K", keycaps: [letterKeycap("K")] },
  navShiftLeft: { hotkey: "Shift+J", keycaps: ["Shift", letterKeycap("J")] },
  navShiftRight: { hotkey: "Shift+K", keycaps: ["Shift", letterKeycap("K")] },
  navMonthPrev: { keycaps: [...MONTH_PICKER_PREV_KEYCAPS] },
  navMonthNext: { keycaps: [...MONTH_PICKER_NEXT_KEYCAPS] },
  navToday: { hotkey: "T", keycaps: [letterKeycap("T")] },
  navGoToDate: { hotkey: "G", keycaps: [letterKeycap("G")] },
  navScrollUp: { hotkey: "PageUp", keycaps: ["PageUp"] },
  navScrollDown: { hotkey: "PageDown", keycaps: ["PageDown"] },
  navScrollHourUp: {
    hotkey: "Alt+ArrowUp",
    keycaps: hotkeyKeycaps("Alt+ArrowUp"),
  },
  navScrollHourDown: {
    hotkey: "Alt+ArrowDown",
    keycaps: hotkeyKeycaps("Alt+ArrowDown"),
  },
  navDayView: {
    hotkey: VIEW_SHORTCUTS.day.key.toUpperCase(),
    keycaps: [VIEW_SHORTCUTS.day.key],
  },
  navWeekView: {
    hotkey: VIEW_SHORTCUTS.week.key.toUpperCase(),
    keycaps: [VIEW_SHORTCUTS.week.key],
  },
  navLifeView: {
    hotkey: LIFE_SHORTCUT.key.toUpperCase(),
    keycaps: [LIFE_SHORTCUT.key],
  },
  createAllDay: { hotkey: "Shift+C", keycaps: ["Shift", "C"] },
  createPlaceDiscard: { hotkey: "Escape", keycaps: ["Escape"] },
  focusSidebar: { hotkey: "I", keycaps: [letterKeycap("I")] },
  focusEvent: { hotkey: "U", keycaps: [letterKeycap("U")] },
  focusWeekDay: { keycaps: ["Shift", letterKeycap("M")] },
  focusNotice: { keycaps: [FOCUS_NOTICE_LETTER] },
  editOpen: { hotkey: "Enter", keycaps: ["Enter"] },
  editDelete: { hotkey: "Delete", keycaps: ["Delete"] },
  editDuplicate: { hotkey: "Mod+D", keycaps: hotkeyKeycaps("Mod+D") },
  editCopy: { hotkey: "Mod+C", keycaps: hotkeyKeycaps("Mod+C") },
  editPaste: { hotkey: "Mod+V", keycaps: hotkeyKeycaps("Mod+V") },
  editMenu: { keycaps: [EVENT_MENU_LETTER] },
  editHide: { keycaps: [HIDE_EVENT_LETTER] },
  editSave: { hotkey: "Mod+Enter", keycaps: hotkeyKeycaps("Mod+Enter") },
  editFieldLeaderInForm: { hotkey: "Mod+E", keycaps: ["Mod+E"] },
  editFormActions: { hotkey: "Mod+0", keycaps: hotkeyKeycaps("Mod+0") },
  otherSidebar: { hotkey: "]", keycaps: ["]"] },
  otherShortcuts: { hotkey: "?", keycaps: ["?"] },
  otherSubscribe: { hotkey: "B", keycaps: [letterKeycap("B")] },
  otherSettings: { hotkey: "Mod+,", keycaps: hotkeyKeycaps("Mod+,") },
  otherTimeTravel: { hotkey: "Z", keycaps: [letterKeycap("Z")] },
} as const;

/** Legend rows whose keycaps must match a binding table entry. */
export const REGISTRY_RUNTIME_KEY_SOURCES: Record<string, readonly string[]> = {
  "nav-up-next": APP_SHORTCUT_BINDINGS.navUpNext.keycaps,
  "nav-join-meeting": APP_SHORTCUT_BINDINGS.navJoinMeeting.keycaps,
  "nav-life-prev": APP_SHORTCUT_BINDINGS.navLifePrevious.keycaps,
  "nav-life-next": APP_SHORTCUT_BINDINGS.navLifeNext.keycaps,
  "nav-life-current": APP_SHORTCUT_BINDINGS.navLifeCurrent.keycaps,
  "nav-previous": APP_SHORTCUT_BINDINGS.navPrevious.keycaps,
  "nav-next": APP_SHORTCUT_BINDINGS.navNext.keycaps,
  "nav-shift-left": APP_SHORTCUT_BINDINGS.navShiftLeft.keycaps,
  "nav-shift-right": APP_SHORTCUT_BINDINGS.navShiftRight.keycaps,
  "nav-month-prev": APP_SHORTCUT_BINDINGS.navMonthPrev.keycaps,
  "nav-month-next": APP_SHORTCUT_BINDINGS.navMonthNext.keycaps,
  "nav-picker-step": KEYMAP.moveFocus.keycaps,
  "nav-today": APP_SHORTCUT_BINDINGS.navToday.keycaps,
  "nav-go-to-date": APP_SHORTCUT_BINDINGS.navGoToDate.keycaps,
  "nav-scroll-up": APP_SHORTCUT_BINDINGS.navScrollUp.keycaps,
  "nav-scroll-down": APP_SHORTCUT_BINDINGS.navScrollDown.keycaps,
  "nav-scroll-hour-up": APP_SHORTCUT_BINDINGS.navScrollHourUp.keycaps,
  "nav-scroll-hour-down": APP_SHORTCUT_BINDINGS.navScrollHourDown.keycaps,
  "nav-day-view": APP_SHORTCUT_BINDINGS.navDayView.keycaps,
  "nav-week-view": APP_SHORTCUT_BINDINGS.navWeekView.keycaps,
  "nav-life-view": APP_SHORTCUT_BINDINGS.navLifeView.keycaps,
  "create-timed": [KEYMAP.createEvent.hotkey.toLowerCase()],
  "create-allday": APP_SHORTCUT_BINDINGS.createAllDay.keycaps,
  "create-place-discard": APP_SHORTCUT_BINDINGS.createPlaceDiscard.keycaps,
  "focus-sidebar": APP_SHORTCUT_BINDINGS.focusSidebar.keycaps,
  "focus-event": APP_SHORTCUT_BINDINGS.focusEvent.keycaps,
  "focus-shift-hold": [KEYMAP.eventJump.bareLetter],
  "focus-week-day": APP_SHORTCUT_BINDINGS.focusWeekDay.keycaps,
  "focus-notice": APP_SHORTCUT_BINDINGS.focusNotice.keycaps,
  "focus-page-jump": KEYMAP.jumpPageTarget.keycaps,
  "focus-find-event": KEYMAP.commandPalette.keycaps,
  "edit-open": APP_SHORTCUT_BINDINGS.editOpen.keycaps,
  "edit-delete": APP_SHORTCUT_BINDINGS.editDelete.keycaps,
  "edit-duplicate": APP_SHORTCUT_BINDINGS.editDuplicate.keycaps,
  "edit-copy": APP_SHORTCUT_BINDINGS.editCopy.keycaps,
  "edit-paste": APP_SHORTCUT_BINDINGS.editPaste.keycaps,
  "edit-menu": APP_SHORTCUT_BINDINGS.editMenu.keycaps,
  "edit-hide": APP_SHORTCUT_BINDINGS.editHide.keycaps,
  "edit-save": APP_SHORTCUT_BINDINGS.editSave.keycaps,
  "edit-field-leader-in-form": [
    ...APP_SHORTCUT_BINDINGS.editFieldLeaderInForm.keycaps,
  ],
  "edit-jump-field-digit": KEYMAP.jumpFormField.keycaps,
  "edit-form-actions": APP_SHORTCUT_BINDINGS.editFormActions.keycaps,
  "edit-focus-prev": [KEYMAP.moveFocus.hotkeys.up],
  "edit-focus-next": [KEYMAP.moveFocus.hotkeys.down],
  "edit-focus-left": [KEYMAP.moveFocus.hotkeys.left],
  "edit-focus-right": [KEYMAP.moveFocus.hotkeys.right],
  "edit-move-prev-day": hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.left),
  "edit-move-next-day": hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.right),
  "edit-move-earlier": hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.up),
  "edit-move-later": hotkeyKeycaps(KEYMAP.moveEvent.hotkeys.down),
  "edit-move-hour-earlier": hotkeyKeycaps(KEYMAP.moveEvent.coarseHotkeys.up),
  "edit-move-hour-later": hotkeyKeycaps(KEYMAP.moveEvent.coarseHotkeys.down),
  "edit-move-week-earlier": hotkeyKeycaps(KEYMAP.moveEvent.coarseHotkeys.left),
  "edit-move-week-later": hotkeyKeycaps(KEYMAP.moveEvent.coarseHotkeys.right),
  "edit-cycle-edge": [KEYMAP.edgeFocus.hotkey],
  "other-sidebar": APP_SHORTCUT_BINDINGS.otherSidebar.keycaps,
  "other-shortcuts": APP_SHORTCUT_BINDINGS.otherShortcuts.keycaps,
  "other-palette": KEYMAP.commandPalette.keycaps,
  "other-subscribe": APP_SHORTCUT_BINDINGS.otherSubscribe.keycaps,
  "other-settings": APP_SHORTCUT_BINDINGS.otherSettings.keycaps,
  "other-undo": hotkeyKeycaps(KEYMAP.undo.hotkey),
  "other-redo": hotkeyKeycaps(KEYMAP.redo.hotkey),
  "other-time-travel": APP_SHORTCUT_BINDINGS.otherTimeTravel.keycaps,
};

/** Edit-sequence legend rows derive from the shared field table. */
export const editSequenceRegistryKeys = (secondKey: string): string[] => [
  KEYMAP.editTitle.sequence.leader,
  secondKey,
];

export { EDIT_SEQUENCE_LETTER_FIELDS };
