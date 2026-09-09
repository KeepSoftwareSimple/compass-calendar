import { KEYMAP } from "@web/shortcuts/keymap";
import {
  DAY_NAME_BY_PREFIX,
  type DayJumpPrefix,
} from "@web/shortcuts/shift-hint/assign-shift-hint-keys";
import { expandModInShortcutDisplay } from "@web/shortcuts/shortcut.util";

export {
  DAY_JUMP_PREFIXES,
  type DayJumpPrefix,
} from "@web/shortcuts/shift-hint/assign-shift-hint-keys";

export type ShortcutHintId =
  | "first-event-save"
  | "save-draft"
  | "form-actions"
  | "life-this-week"
  | "edit-sequence"
  | "nudge"
  | "edge-focus"
  | "create-event"
  | "page-jump"
  | "event-jump"
  | "week-day-focus"
  | "command-palette";

export type ShortcutActionId =
  | "calendar.create_timed_event"
  | "calendar.event_jump"
  | "calendar.focus_week_day"
  | "calendar.page_jump"
  | "command_palette.open"
  | "event.edge_focus"
  | "event.edit_title"
  | "event.move"
  | "event_form.actions"
  | "event_form.progress"
  | "life.focus_current_week";

export type ShortcutFeatureArea =
  | "calendar_navigation"
  | "command_palette"
  | "event_creation"
  | "event_editing"
  | "life_navigation";

export type ShortcutSuggestionReason =
  | "calendar_idle"
  | "event_form"
  | "event_focused"
  | "first_event"
  | "life_view"
  | "local_discovery"
  | "local_fatigue"
  | "local_recency"
  | "week_view";

export type ShortcutTipPart =
  | string
  | { key: string }
  | { keys: readonly string[] };

export type ShortcutHint = {
  id: ShortcutHintId;
  actionId: ShortcutActionId;
  featureArea: ShortcutFeatureArea;
  parts: readonly ShortcutTipPart[];
  suggestionReason: ShortcutSuggestionReason;
};

export type RankedShortcutHint = ShortcutHint & {
  reasonCode: ShortcutSuggestionReason;
};

const spokenKey = (token: string): string => {
  const expanded = expandModInShortcutDisplay(token);
  if (expanded === "Meta") return "Cmd";
  if (expanded === "Control") return "Ctrl";
  return expanded;
};

const partPlainText = (part: ShortcutTipPart): string => {
  if (typeof part === "string") return part;
  const keys = "keys" in part ? part.keys : [part.key];
  return keys.map(spokenKey).join("+");
};

export const getPartsPlainText = (parts: readonly ShortcutTipPart[]): string =>
  parts.map(partPlainText).join("");

export const getHintPlainText = (hint: Pick<ShortcutHint, "parts">): string =>
  getPartsPlainText(hint.parts);

const [createKey] = KEYMAP.createEvent.keycaps;
const [saveKey] = KEYMAP.saveDraft.keycaps;
const [editLeader, editSecond] = KEYMAP.editTitle.keycaps;
const [eventJumpKey] = KEYMAP.eventJump.keycaps;
const [nudgeModifier] = KEYMAP.moveEvent.keycaps;

/** Weekend prefixes are a two-key chord: Shift+S selects the pair, then the
 * second letter picks the day. */
function weekDayFocusParts(prefix: DayJumpPrefix): readonly ShortcutTipPart[] {
  const dayName = DAY_NAME_BY_PREFIX[prefix];
  const [first, second] = prefix;
  const shifted = { keys: ["Shift", first.toUpperCase()] } as const;
  if (!second) return [shifted, ` jumps to ${dayName}`];
  return [
    shifted,
    " then ",
    { key: second.toUpperCase() },
    ` jumps to ${dayName}`,
  ];
}

/** The weekday tip names whichever column the sidebar picked, so it teaches the
 * whole week over time instead of Monday forever. */
export function weekDayFocusHint(prefix: DayJumpPrefix): ShortcutHint {
  return {
    ...SHORTCUT_HINTS["week-day-focus"],
    parts: weekDayFocusParts(prefix),
  };
}

export const SHORTCUT_HINTS: Record<ShortcutHintId, ShortcutHint> = {
  "first-event-save": {
    id: "first-event-save",
    actionId: "event_form.progress",
    featureArea: "event_creation",
    parts: ["Type a title, then ", { key: saveKey }],
    suggestionReason: "first_event",
  },
  "save-draft": {
    id: "save-draft",
    actionId: "event_form.progress",
    featureArea: "event_editing",
    parts: [
      { key: saveKey },
      " saves · hold ",
      { key: KEYMAP.jumpFormField.holdModifier },
      " to jump fields",
    ],
    suggestionReason: "event_form",
  },
  "form-actions": {
    id: "form-actions",
    actionId: "event_form.actions",
    featureArea: "event_editing",
    parts: [
      "Hold ",
      { key: KEYMAP.jumpFormField.holdModifier },
      " then ",
      { key: "0" },
      " for actions",
    ],
    suggestionReason: "event_form",
  },
  "life-this-week": {
    id: "life-this-week",
    actionId: "life.focus_current_week",
    featureArea: "life_navigation",
    parts: [{ key: "T" }, " jumps to this week"],
    suggestionReason: "life_view",
  },
  "edit-sequence": {
    id: "edit-sequence",
    actionId: "event.edit_title",
    featureArea: "event_editing",
    parts: [
      { key: editLeader },
      " then ",
      { key: editSecond },
      " edits the title",
    ],
    suggestionReason: "event_focused",
  },
  "create-event": {
    id: "create-event",
    actionId: "calendar.create_timed_event",
    featureArea: "event_creation",
    parts: [{ key: createKey }, " creates an event"],
    suggestionReason: "calendar_idle",
  },
  "page-jump": {
    id: "page-jump",
    actionId: "calendar.page_jump",
    featureArea: "calendar_navigation",
    parts: [
      "Hold ",
      { key: KEYMAP.jumpPageTarget.holdModifier },
      " to see jump targets",
    ],
    suggestionReason: "calendar_idle",
  },
  "event-jump": {
    id: "event-jump",
    actionId: "calendar.event_jump",
    featureArea: "calendar_navigation",
    parts: [{ key: eventJumpKey }, " shows event and open-time shortcuts"],
    suggestionReason: "calendar_idle",
  },
  "week-day-focus": {
    id: "week-day-focus",
    actionId: "calendar.focus_week_day",
    featureArea: "calendar_navigation",
    parts: weekDayFocusParts("m"),
    suggestionReason: "week_view",
  },
  nudge: {
    id: "nudge",
    actionId: "event.move",
    featureArea: "event_editing",
    parts: [{ key: nudgeModifier }, " and an arrow moves the event"],
    suggestionReason: "event_focused",
  },
  "edge-focus": {
    id: "edge-focus",
    actionId: "event.edge_focus",
    featureArea: "event_editing",
    parts: [
      { key: KEYMAP.edgeFocus.hotkey },
      " picks an edge, then ",
      { key: nudgeModifier },
      " and up or down",
    ],
    suggestionReason: "event_focused",
  },
  "command-palette": {
    id: "command-palette",
    actionId: "command_palette.open",
    featureArea: "command_palette",
    parts: [
      { keys: KEYMAP.commandPalette.keycaps },
      " opens the command palette",
    ],
    suggestionReason: "calendar_idle",
  },
};

export function getShortcutHint(id: ShortcutHintId): ShortcutHint {
  return SHORTCUT_HINTS[id];
}

export function isShortcutHintId(value: string): value is ShortcutHintId {
  return Object.hasOwn(SHORTCUT_HINTS, value);
}
