import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { type BlockedPointerAttempt } from "@web/shortcuts/keyboard-only/pointer-action";

export type PointerHintState = {
  /** Increments on every teachable click so the pointer hint can show. */
  pulse: number;
  /** Semantic intent of the latest teachable pointerdown. */
  latestAttempt: BlockedPointerAttempt | null;
};

export const initialPointerHintState: PointerHintState = {
  pulse: 0,
  latestAttempt: null,
};

export const usePointerHintStore = create<PointerHintState>()(
  devtools(() => initialPointerHintState, {
    name: "compass/pointer-hint",
    enabled: IS_DEV,
  }),
);

export const pointerHintActions = {
  pulse: (attempt: BlockedPointerAttempt = { actionId: "unknown" }) =>
    usePointerHintStore.setState(
      (state) => ({
        pulse: state.pulse + 1,
        latestAttempt: attempt,
      }),
      false,
      { type: "pulse" },
    ),
};

export const selectPointerHintPulse = (state: PointerHintState) => state.pulse;

export const selectPointerHintAttempt = (state: PointerHintState) =>
  state.latestAttempt;
