import {
  tieredDatePickerGridCaptionHints,
  tieredDatePickerGridDayHints,
  tieredDatePickerOpenInputHints,
  tieredRecurrenceUntilHints,
  tieredSidebarMonthPickerHints,
} from "@core/shortcuts/contextual-hint-tiers";
import { type CaptionPickerView } from "@web/components/DatePicker/DatePicker";
import {
  captionHintId,
  type DatePickerHintSurface,
  type GridDatePickerHintId,
} from "@web/shortcuts/tips/date-picker-hint.store";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

/**
 * The surface an open grid popover publishes: the caption subviews answer on
 * the field's `-caption` id, so the id and the parts are chosen from
 * `captionView` in one place and cannot disagree about which view is showing.
 * Callers pop this instead of calling with a closed picker.
 */
export function datePickerHintSurface(params: {
  baseId: GridDatePickerHintId;
  captionView: CaptionPickerView;
  isInputFocused: boolean;
  inputPhrase: string;
}): DatePickerHintSurface {
  const { baseId, captionView, isInputFocused, inputPhrase } = params;

  if (captionView === "year" || captionView === "month") {
    const tiered = tieredDatePickerGridCaptionHints(captionView);
    return {
      id: captionHintId(baseId),
      parts: tiered.primary as readonly ShortcutTipPart[],
      secondaryParts: tiered.secondary as readonly ShortcutTipPart[],
    };
  }

  if (isInputFocused) {
    const tiered = tieredDatePickerOpenInputHints(inputPhrase);
    return {
      id: baseId,
      parts: tiered.primary as readonly ShortcutTipPart[],
      secondaryParts: tiered.secondary as readonly ShortcutTipPart[],
    };
  }

  const tiered = tieredDatePickerGridDayHints();
  return {
    id: baseId,
    parts: tiered.primary as readonly ShortcutTipPart[],
    secondaryParts: tiered.secondary as readonly ShortcutTipPart[],
  };
}

export function buildSidebarMonthPickerParts(): readonly ShortcutTipPart[] {
  return tieredSidebarMonthPickerHints().primary as readonly ShortcutTipPart[];
}

export function buildRecurrenceUntilParts(): DatePickerHintSurface {
  const tiered = tieredRecurrenceUntilHints();
  return {
    id: "date-picker-recurrence-until",
    parts: tiered.primary as readonly ShortcutTipPart[],
    secondaryParts: tiered.secondary as readonly ShortcutTipPart[],
  };
}
