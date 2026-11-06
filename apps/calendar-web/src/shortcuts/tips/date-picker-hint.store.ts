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

export type DatePickerHintSurface = {
  id: DatePickerHintId;
  parts: readonly ShortcutTipPart[];
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
  clearAll: () => {
    useDatePickerHintStore.setState(initialState, false, {
      type: "datePickerHint/clearAll",
    });
  },
};

export function resetDatePickerHintStoreForTests(): void {
  useDatePickerHintStore.setState(initialState, true);
}
