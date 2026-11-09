import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export type DatePickerHintId =
  | "date-picker-life"
  | "date-picker-life-caption"
  | "date-picker-event-form"
  | "date-picker-event-form-caption"
  | "date-picker-recurrence-until"
  | "date-picker-sidebar-month";

/** Grid popover date fields; each also has a `-caption` id for its subviews. */
export type GridDatePickerHintId =
  | "date-picker-life"
  | "date-picker-event-form";

/** The id a grid field publishes under while the month or year list is open. */
export function captionHintId(base: GridDatePickerHintId): DatePickerHintId {
  return base === "date-picker-life"
    ? "date-picker-life-caption"
    : "date-picker-event-form-caption";
}

export type DatePickerHintSurface = {
  id: DatePickerHintId;
  parts: readonly ShortcutTipPart[];
  secondaryParts?: readonly ShortcutTipPart[];
};

type DatePickerHintState = {
  stack: readonly DatePickerHintSurface[];
};

const initialState: DatePickerHintState = {
  stack: [],
};

export const useDatePickerHintStore = create<DatePickerHintState>()(
  devtools(() => initialState, {
    name: "compass/datePickerHint",
    enabled: IS_DEV,
  }),
);

export const datePickerHintActions = {
  push: (surface: DatePickerHintSurface) => {
    useDatePickerHintStore.setState(
      (state) => ({
        stack: [...state.stack.filter((s) => s.id !== surface.id), surface],
      }),
      false,
      { type: "datePickerHint/push", id: surface.id },
    );
  },
  pop: (id: DatePickerHintId) => {
    useDatePickerHintStore.setState(
      (state) => ({
        stack: state.stack.filter((s) => s.id !== id),
      }),
      false,
      { type: "datePickerHint/pop", id },
    );
  },
};

export function resetDatePickerHintStoreForTests(): void {
  useDatePickerHintStore.setState(initialState, true);
}
