import { useCallback, useEffect, useState } from "react";
import { type CaptionPickerView } from "@web/components/DatePicker/DatePicker";
import {
  buildDatePickerGridCaptionParts,
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

function captionHintId(base: DatePickerHintId): DatePickerHintId {
  return `${base}-caption` as DatePickerHintId;
}

/**
 * Grid popover date fields (Life birth, event form): sidebar shows the active
 * keyboard contract for typing vs grid vs caption subviews.
 */
export function useCaptionableGridDatePickerHint(args: {
  baseId: DatePickerHintId;
  isOpen: boolean;
  gridFocused: boolean;
  captionView: CaptionPickerView;
  inputPhrase: string;
}) {
  const { baseId, isOpen, gridFocused, captionView, inputPhrase } = args;
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
    }
  }, [baseId, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (captionView === "year" || captionView === "month") {
      datePickerHintActions.pop(baseId);
      datePickerHintActions.push({
        id: captionHintId(baseId),
        parts:
          captionView === "year"
            ? buildDatePickerGridCaptionParts("year")
            : buildDatePickerGridCaptionParts("month"),
      });
      return () => datePickerHintActions.pop(captionHintId(baseId));
    }

    datePickerHintActions.pop(captionHintId(baseId));
    const surface = surfaceForPickerContext({
      id: baseId,
      isOpen,
      gridFocused,
      captionView: "day",
      isInputFocused: inputFocused,
      inputPhrase,
    });
    if (surface) {
      datePickerHintActions.push(surface);
    } else {
      datePickerHintActions.pop(baseId);
    }
    return () => datePickerHintActions.pop(baseId);
  }, [baseId, captionView, gridFocused, inputFocused, inputPhrase, isOpen]);

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
