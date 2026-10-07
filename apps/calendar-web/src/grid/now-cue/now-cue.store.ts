import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export const NOW_CUE_PULSE_MS = 700;

type NowCueState = {
  /** Increments on each "already at now" teach pulse. */
  pulse: number;
};

export const initialNowCueState: NowCueState = { pulse: 0 };

export const useNowCueStore = create<NowCueState>()(
  devtools(() => initialNowCueState, {
    name: "compass/now-cue",
    enabled: IS_DEV,
  }),
);

export const nowCueActions = {
  pulse: () => {
    useNowCueStore.setState((state) => ({ pulse: state.pulse + 1 }), false, {
      type: "pulse",
    });
  },
  resetForTests: () => {
    useNowCueStore.setState(initialNowCueState, true);
  },
};
