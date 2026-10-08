import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export const NOW_CUE_PULSE_MS = 700;

type NowCueState = {
  /** True for {@link NOW_CUE_PULSE_MS} after an already-at-now teach pulse. */
  active: boolean;
};

export const initialNowCueState: NowCueState = { active: false };

let pulseTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

export const useNowCueStore = create<NowCueState>()(
  devtools(() => initialNowCueState, {
    name: "compass/now-cue",
    enabled: IS_DEV,
  }),
);

const clearPulseTimer = () => {
  if (pulseTimer === undefined) return;
  globalThis.clearTimeout(pulseTimer);
  pulseTimer = undefined;
};

export const nowCueActions = {
  pulse: () => {
    clearPulseTimer();
    useNowCueStore.setState({ active: true }, false, { type: "pulse" });
    pulseTimer = globalThis.setTimeout(() => {
      pulseTimer = undefined;
      useNowCueStore.setState({ active: false }, false, { type: "pulse-end" });
    }, NOW_CUE_PULSE_MS);
  },
  resetForTests: () => {
    clearPulseTimer();
    useNowCueStore.setState(initialNowCueState, true);
  },
};

export const selectNowCueActive = (state: NowCueState) => state.active;
