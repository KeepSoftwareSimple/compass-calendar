import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { type BlockedPointerAttempt } from "@web/shortcuts/keyboard-only/pointer-action";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";

const HINT_VISIBLE_MS = 2500;

let hideTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

export type PointerHintState = {
  /** Increments on every teachable click so the pointer hint can show. */
  pulse: number;
  /** Semantic intent of the latest teachable pointerdown. */
  latestAttempt: BlockedPointerAttempt | null;
  /** True while the pill should paint (pulse-driven, timed hide). */
  isVisible: boolean;
};

export const initialPointerHintState: PointerHintState = {
  pulse: 0,
  latestAttempt: null,
  isVisible: false,
};

export const usePointerHintStore = create<PointerHintState>()(
  devtools(() => initialPointerHintState, {
    name: "compass/pointer-hint",
    enabled: IS_DEV,
  }),
);

export const pointerHintActions = {
  pulse: (attempt: BlockedPointerAttempt = { actionId: "unknown" }) => {
    if (hideTimer !== undefined) globalThis.clearTimeout(hideTimer);
    usePointerHintStore.setState(
      (state) => ({
        pulse: state.pulse + 1,
        latestAttempt: attempt,
        isVisible: true,
      }),
      false,
      { type: "pulse" },
    );
    hideTimer = globalThis.setTimeout(() => {
      hideTimer = undefined;
      usePointerHintStore.setState({ isVisible: false }, false, {
        type: "hide",
      });
    }, HINT_VISIBLE_MS);
  },
  hide: () => {
    if (hideTimer !== undefined) {
      globalThis.clearTimeout(hideTimer);
      hideTimer = undefined;
    }
    usePointerHintStore.setState({ isVisible: false }, false, { type: "hide" });
  },
};

export const resetPointerHintTimerForTests = (): void => {
  if (hideTimer !== undefined) {
    globalThis.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
};

export const selectPointerHintPulse = (state: PointerHintState) => state.pulse;

export const selectPointerHintAttempt = (state: PointerHintState) =>
  state.latestAttempt;

export const selectPointerHintVisible = (state: PointerHintState) =>
  state.isVisible;

/** Whether the pointer hint pill should claim the onboarding surface slot. */
export const selectPointerHintSurfaceEligible = (
  state: PointerHintState,
): boolean => state.isVisible && !readPointerHintDismissedPermanently();
