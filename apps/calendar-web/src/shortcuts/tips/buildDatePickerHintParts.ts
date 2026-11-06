import { type DatePickerHintId } from "@web/shortcuts/tips/date-picker-hint.store";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

const sep: ShortcutTipPart = " · ";

/** At most three key tokens per shortcut row; plain strings for glue. */
export function buildDatePickerGridDayParts(): readonly ShortcutTipPart[] {
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

export function buildDatePickerGridCaptionParts(
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

export function buildDatePickerClosedInputParts(
  label: string,
): readonly ShortcutTipPart[] {
  return [{ keys: ["ArrowDown"] }, ` open ${label}`];
}

export function buildDatePickerOpenInputParts(
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
  gridFocused?: boolean;
  captionView?: "day" | "month" | "year";
  isInputFocused: boolean;
  inputPhrase: string;
}): { id: DatePickerHintId; parts: readonly ShortcutTipPart[] } | null {
  const { id, isOpen, gridFocused, captionView, isInputFocused, inputPhrase } =
    params;

  if (!isOpen) {
    if (id === "date-picker-sidebar-month") {
      return { id, parts: buildSidebarMonthPickerParts() };
    }
    return null;
  }

  if (captionView === "year") {
    return { id, parts: buildDatePickerGridCaptionParts("year") };
  }
  if (captionView === "month") {
    return { id, parts: buildDatePickerGridCaptionParts("month") };
  }

  if (gridFocused) {
    return { id, parts: buildDatePickerGridDayParts() };
  }

  if (isInputFocused) {
    return { id, parts: buildDatePickerOpenInputParts(inputPhrase) };
  }

  return { id, parts: buildDatePickerClosedInputParts(inputPhrase) };
}
