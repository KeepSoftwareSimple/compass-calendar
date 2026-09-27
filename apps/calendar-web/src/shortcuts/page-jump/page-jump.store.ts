import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export type PageJumpHintState = {
  areHintsVisible: boolean;
};

export const initialPageJumpHintState: PageJumpHintState = {
  areHintsVisible: false,
};

export const usePageJumpHintStore = create<PageJumpHintState>()(
  devtools(() => initialPageJumpHintState, {
    name: "compass/page-jump-hint",
    enabled: IS_DEV,
  }),
);

export const pageJumpHintActions = {
  setHintsVisible: (areHintsVisible: boolean) =>
    usePageJumpHintStore.setState({ areHintsVisible }, false, {
      type: "setHintsVisible",
    }),
  reset: () =>
    usePageJumpHintStore.setState(initialPageJumpHintState, false, {
      type: "reset",
    }),
};

export const selectPageJumpHintsVisible = (state: PageJumpHintState) =>
  state.areHintsVisible;
