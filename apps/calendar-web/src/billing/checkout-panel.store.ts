import { create } from "zustand";
import { type ShortcutFeatureArea } from "@web/shortcuts/tips/shortcut-tips.data";

/** Where Checkout was opened from. `null` is the billing gate itself. */
export type CheckoutPanelSource = {
  kind: "shortcut_prompt" | "banner" | "trial_banner";
  featureArea?: ShortcutFeatureArea;
  actionId?: string;
};

export type CheckoutPanelState = {
  isOpen: boolean;
  source: CheckoutPanelSource | null;
};

export const initialCheckoutPanelState: CheckoutPanelState = {
  isOpen: false,
  source: null,
};

/** In-memory: a reload puts the trial ask back in front of the user. */
export const useCheckoutPanelStore = create<CheckoutPanelState>()(() => ({
  ...initialCheckoutPanelState,
}));

export const checkoutPanelActions = {
  /** `source` survives until close so completion can attribute the conversion. */
  open: (source: CheckoutPanelSource | null = null) => {
    useCheckoutPanelStore.setState({ isOpen: true, source });
  },
  close: () => {
    useCheckoutPanelStore.setState({ isOpen: false, source: null });
  },
};

export const selectCheckoutPanelOpen = (state: CheckoutPanelState) =>
  state.isOpen;
