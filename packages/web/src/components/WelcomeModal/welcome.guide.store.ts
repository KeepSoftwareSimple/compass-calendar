import { create } from "zustand";

export interface WelcomeGuideState {
  isOpen: boolean;
  isFirstVisitOpen: boolean;
}

export const useWelcomeGuideStore = create<WelcomeGuideState>()(() => ({
  isOpen: false,
  isFirstVisitOpen: false,
}));

export const welcomeGuideActions = {
  open: () => useWelcomeGuideStore.setState({ isOpen: true }),
  close: () => useWelcomeGuideStore.setState({ isOpen: false }),
  setFirstVisitOpen: (isFirstVisitOpen: boolean) =>
    useWelcomeGuideStore.setState({ isFirstVisitOpen }),
};

export const selectWelcomeGuideOpen = (state: WelcomeGuideState) =>
  state.isOpen;

export const selectWelcomeFirstVisitOpen = (state: WelcomeGuideState) =>
  state.isFirstVisitOpen;

export const selectWelcomeSurfaceOpen = (state: WelcomeGuideState) =>
  state.isOpen || state.isFirstVisitOpen;

/** Whether the post-signup welcome guide should claim the onboarding slot. */
export const selectWelcomeGuideSurfaceEligible = (
  billingGateClear: boolean,
  isOpen: boolean,
): boolean => billingGateClear && isOpen;
