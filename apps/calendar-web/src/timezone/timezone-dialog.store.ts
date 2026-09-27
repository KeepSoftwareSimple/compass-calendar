import { create } from "zustand";

export type TimezoneDialogPurpose = "pin" | "time-travel";

interface TimezoneDialogState {
  isOpen: boolean;
  purpose: TimezoneDialogPurpose;
}

export const useTimezoneDialogStore = create<TimezoneDialogState>()(() => ({
  isOpen: false,
  purpose: "pin",
}));

export const timezoneDialogActions = {
  open: (purpose: TimezoneDialogPurpose = "pin") =>
    useTimezoneDialogStore.setState({ isOpen: true, purpose }),
  close: () =>
    useTimezoneDialogStore.setState({
      isOpen: false,
      purpose: "pin",
    }),
};

export const selectTimezoneDialogOpen = (state: TimezoneDialogState) =>
  state.isOpen;

export const selectTimezoneDialogPurpose = (state: TimezoneDialogState) =>
  state.purpose;
