import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export type UpNextOpenActivity = "gridClick" | "keyboardEdit";

export type UpNextAvailabilityState = {
  hasUpNext: boolean;
  hasConference: boolean;
  openEventDetails: (activity: UpNextOpenActivity) => void;
  joinMeeting: () => void;
};

const noop = () => {};

export const initialUpNextAvailabilityState: UpNextAvailabilityState = {
  hasUpNext: false,
  hasConference: false,
  openEventDetails: noop,
  joinMeeting: noop,
};

/**
 * Snapshot of Up Next for surfaces that must not mount the day-events query
 * (the command palette). Written by `useUpNextEvent`; empty until that hook
 * has run, which matches isolated palette tests and the no-event case.
 */
export const useUpNextAvailabilityStore = create<UpNextAvailabilityState>()(
  devtools(() => initialUpNextAvailabilityState, {
    name: "compass/up-next-availability",
    enabled: IS_DEV,
  }),
);

export const upNextAvailabilityActions = {
  publish: (next: UpNextAvailabilityState) =>
    useUpNextAvailabilityStore.setState(next, false, { type: "publish" }),
  reset: () =>
    useUpNextAvailabilityStore.setState(initialUpNextAvailabilityState, true, {
      type: "reset",
    }),
};
