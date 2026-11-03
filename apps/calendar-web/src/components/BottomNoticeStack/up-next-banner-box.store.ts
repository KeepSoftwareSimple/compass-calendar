import { create } from "zustand";
import { type UpNextBannerBox } from "@web/components/BottomNoticeStack/bottom-notice-stack-lift.util";

interface UpNextBannerBoxState {
  box: UpNextBannerBox | null;
}

/** Where the centered Up Next banner sits, so the bottom stack can avoid it. */
export const useUpNextBannerBoxStore = create<UpNextBannerBoxState>(() => ({
  box: null,
}));

const sameBox = (a: UpNextBannerBox | null, b: UpNextBannerBox | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.left === b.left &&
    a.right === b.right &&
    a.top === b.top);

export const upNextBannerBoxActions = {
  setBox: (box: UpNextBannerBox | null) => {
    if (sameBox(useUpNextBannerBoxStore.getState().box, box)) return;
    useUpNextBannerBoxStore.setState({ box });
  },
};

export const selectUpNextBannerBox = (state: UpNextBannerBoxState) => state.box;
