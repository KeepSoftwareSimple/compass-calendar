import { create } from "zustand";

export type CheckoutCelebrationState = {
  /**
   * True from the moment embedded Checkout completes until they dismiss
   * the celebration.
   */
  isCelebrating: boolean;
};

export const initialCheckoutCelebrationState: CheckoutCelebrationState = {
  isCelebrating: false,
};

/**
 * Deliberately in-memory, with no "already seen" stamp. A persisted flag
 * would suppress the celebration for someone who cancels and subscribes
 * again later, which is exactly the moment worth marking.
 */
export const useCheckoutCelebrationStore = create<CheckoutCelebrationState>()(
  () => ({ ...initialCheckoutCelebrationState }),
);

export const checkoutCelebrationActions = {
  celebrate: () => {
    useCheckoutCelebrationStore.setState({ isCelebrating: true });
  },
  dismiss: () => {
    useCheckoutCelebrationStore.setState({ isCelebrating: false });
  },
};

export const selectIsCelebrating = (state: CheckoutCelebrationState) =>
  state.isCelebrating;
