import { create } from "zustand";

export type TimezoneDialogPurpose = "pin" | "time-travel";

interface TimezoneDialogState {
  isOpen: boolean;
  purpose: TimezoneDialogPurpose;
  restoreFocus?: () => void;
}

export const useTimezoneDialogStore = create<TimezoneDialogState>()(() => ({
  isOpen: false,
  purpose: "pin",
}));

export const timezoneDialogActions = {
  open: (restoreFocus?: () => void, purpose: TimezoneDialogPurpose = "pin") =>
    useTimezoneDialogStore.setState({ isOpen: true, purpose, restoreFocus }),
  close: () =>
    useTimezoneDialogStore.setState({
      isOpen: false,
      purpose: "pin",
      restoreFocus: undefined,
    }),
};

export const selectTimezoneDialogOpen = (state: TimezoneDialogState) =>
  state.isOpen;

export const selectTimezoneDialogPurpose = (state: TimezoneDialogState) =>
  state.purpose;

export const selectTimezoneDialogRestoreFocus = (state: TimezoneDialogState) =>
  state.restoreFocus;
