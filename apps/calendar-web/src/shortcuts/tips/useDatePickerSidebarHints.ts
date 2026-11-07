import { useCallback, useEffect, useState } from "react";
import { type CaptionPickerView } from "@web/components/DatePicker/DatePicker";
import {
  buildRecurrenceUntilParts,
  buildSidebarMonthPickerParts,
  datePickerHintSurface,
} from "@web/shortcuts/tips/buildDatePickerHintParts";
import {
  captionHintId,
  type DatePickerHintId,
  datePickerHintActions,
  type GridDatePickerHintId,
  useDatePickerHintStore,
} from "@web/shortcuts/tips/date-picker-hint.store";
import { shouldDeferSidebarMonthHint } from "@web/shortcuts/tips/datePickerHintPriority";

/**
 * Grid popover date fields (Life birth, event form): sidebar shows the active
 * keyboard contract for typing vs grid vs caption subviews.
 */
export function useCaptionableGridDatePickerHint(args: {
  baseId: GridDatePickerHintId;
  isOpen: boolean;
  captionView: CaptionPickerView;
  inputPhrase: string;
}) {
  const { baseId, isOpen, captionView, inputPhrase } = args;
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    return () => {
      datePickerHintActions.pop(baseId);
      datePickerHintActions.pop(captionHintId(baseId));
    };
  }, [baseId]);

  useEffect(() => {
    if (!isOpen) {
      datePickerHintActions.pop(baseId);
      datePickerHintActions.pop(captionHintId(baseId));
      return;
    }

    const surface = datePickerHintSurface({
      baseId,
      captionView,
      isInputFocused: inputFocused,
      inputPhrase,
    });
    // Only one of the pair publishes at a time; drop whichever the new view
    // is not using so a day-grid line never sits under a caption line.
    datePickerHintActions.pop(
      surface.id === baseId ? captionHintId(baseId) : baseId,
    );
    datePickerHintActions.push(surface);
    return () => datePickerHintActions.pop(surface.id);
  }, [baseId, captionView, inputFocused, inputPhrase, isOpen]);

  return {
    onPickerInputFocus: useCallback(() => setInputFocused(true), []),
    onPickerInputBlur: useCallback(() => setInputFocused(false), []),
  };
}

export function SidebarMonthPickerHintEffect() {
  const stack = useDatePickerHintStore((s) => s.stack);
  const defer = shouldDeferSidebarMonthHint(stack);

  useEffect(() => {
    const id: DatePickerHintId = "date-picker-sidebar-month";
    if (defer) {
      datePickerHintActions.pop(id);
      return;
    }
    datePickerHintActions.push({
      id,
      parts: buildSidebarMonthPickerParts(),
    });
    return () => datePickerHintActions.pop(id);
  }, [defer]);

  return null;
}

export function RecurrenceUntilPickerHintEffect({ open }: { open: boolean }) {
  useEffect(() => {
    const id: DatePickerHintId = "date-picker-recurrence-until";
    if (!open) {
      datePickerHintActions.pop(id);
      return;
    }
    datePickerHintActions.push({ id, parts: buildRecurrenceUntilParts() });
    return () => datePickerHintActions.pop(id);
  }, [open]);

  return null;
}
