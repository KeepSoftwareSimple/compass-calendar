import { type DatePickerHintId } from "@web/shortcuts/tips/date-picker-hint.store";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

const sep: ShortcutTipPart = " · ";

/** At most three key tokens per shortcut row; plain strings for glue. */
function buildDatePickerGridDayParts(): readonly ShortcutTipPart[] {
  return [
    { keys: ["ArrowLeft", "ArrowRight"] },
    " day",
    sep,
    { keys: ["ArrowUp", "ArrowDown"] },
    " week",
    sep,
    { keys: ["PageDown"] },
    " month",
    sep,
    { keys: ["Shift", "PageDown"] },
    " year",
    sep,
    { keys: ["Enter"] },
    " pick",
    sep,
    { keys: ["Esc"] },
    " close",
    sep,
    { keys: ["Tab"] },
    " leave and save typed text",
  ];
}

function buildDatePickerGridCaptionParts(
  kind: "month" | "year",
): readonly ShortcutTipPart[] {
  if (kind === "month") {
    return [
      { keys: ["ArrowUp", "ArrowDown"] },
      " move",
      sep,
      { keys: ["Enter"] },
      " select",
      sep,
      { keys: ["Esc"] },
      " back",
    ];
  }
  return [
    { keys: ["ArrowUp", "ArrowDown"] },
    " move years",
    sep,
    { keys: ["Enter"] },
    " months",
    sep,
    { keys: ["Esc"] },
    " back",
  ];
}

function buildDatePickerOpenInputParts(
  label: string,
): readonly ShortcutTipPart[] {
  return [
    { keys: ["Enter"] },
    ` save ${label}`,
    sep,
    { keys: ["ArrowDown"] },
    " calendar",
    sep,
    { keys: ["Esc"] },
    " dismiss",
  ];
}

export function buildSidebarMonthPickerParts(): readonly ShortcutTipPart[] {
  return [
    { keys: ["ArrowUp", "ArrowDown"] },
    " move",
    sep,
    { keys: ["Enter"] },
    " select",
    sep,
    { keys: ["U"] },
    " back to grid",
  ];
}

export function buildRecurrenceUntilParts(): readonly ShortcutTipPart[] {
  return [
    { keys: ["ArrowLeft", "ArrowRight"] },
    " day",
    sep,
    { keys: ["Enter"] },
    " pick end",
    sep,
    { keys: ["Esc"] },
    " close",
  ];
}

export function surfaceForPickerContext(params: {
  id: DatePickerHintId;
  isOpen: boolean;
  captionView?: "day" | "month" | "year";
  isInputFocused: boolean;
  inputPhrase: string;
}): { id: DatePickerHintId; parts: readonly ShortcutTipPart[] } | null {
  const { id, isOpen, captionView, isInputFocused, inputPhrase } = params;

  if (!isOpen) return null;

  if (captionView === "year" || captionView === "month") {
    return { id, parts: buildDatePickerGridCaptionParts(captionView) };
  }

  if (isInputFocused) {
    return { id, parts: buildDatePickerOpenInputParts(inputPhrase) };
  }

  // Calendar is open on a grid popover: never advertise the closed-field
  // "ArrowDown open …" contract while the panel is visible (focus may be on
  // the popper root, a day cell, or the clear control before ArrowDown).
  return { id, parts: buildDatePickerGridDayParts() };
}
