import { useCallback, useEffect, useState } from "react";
import { type CaptionPickerView } from "@web/components/DatePicker/DatePicker";
import {
  buildRecurrenceUntilParts,
  buildSidebarMonthPickerParts,
  surfaceForPickerContext,
} from "@web/shortcuts/tips/buildDatePickerHintParts";
import {
  type DatePickerHintId,
  datePickerHintActions,
  useDatePickerHintStore,
} from "@web/shortcuts/tips/date-picker-hint.store";
import { shouldDeferSidebarMonthHint } from "@web/shortcuts/tips/datePickerHintPriority";

type GridDatePickerHintId = "date-picker-life" | "date-picker-event-form";

function captionHintId(base: GridDatePickerHintId): DatePickerHintId {
  return base === "date-picker-life"
    ? "date-picker-life-caption"
    : "date-picker-event-form-caption";
}

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

    const isCaption = captionView === "year" || captionView === "month";
    const activeId = isCaption ? captionHintId(baseId) : baseId;
    datePickerHintActions.pop(isCaption ? baseId : captionHintId(baseId));
    const surface = surfaceForPickerContext({
      id: activeId,
      isOpen: true,
      captionView,
      isInputFocused: inputFocused,
      inputPhrase,
    });
    if (surface) datePickerHintActions.push(surface);
    return () => datePickerHintActions.pop(activeId);
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
