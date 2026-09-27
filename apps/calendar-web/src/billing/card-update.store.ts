import { create } from "zustand";

export type CardUpdateState = {
  isOpen: boolean;
};

export const initialCardUpdateState: CardUpdateState = {
  isOpen: false,
};

/**
 * In-memory: the gate's checkout panel and Settings card-update form must
 * not open each other. A reload leaves the form closed.
 */
export const useCardUpdateStore = create<CardUpdateState>()(() => ({
  ...initialCardUpdateState,
}));

export const cardUpdateActions = {
  open: () => {
    useCardUpdateStore.setState({ isOpen: true });
  },
  close: () => {
    useCardUpdateStore.setState({ isOpen: false });
  },
};

export const selectCardUpdateOpen = (state: CardUpdateState) => state.isOpen;
