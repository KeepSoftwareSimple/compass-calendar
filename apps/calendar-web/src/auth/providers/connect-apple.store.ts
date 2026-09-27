import { create } from "zustand";

export type ConnectAppleState = {
  isOpen: boolean;
  initialEmail: string;
};

const initialConnectAppleState: ConnectAppleState = {
  isOpen: false,
  initialEmail: "",
};

export const useConnectAppleStore = create<ConnectAppleState>(
  () => initialConnectAppleState,
);

export const connectAppleActions = {
  open: (initialEmail = ""): void => {
    useConnectAppleStore.setState({
      isOpen: true,
      initialEmail: initialEmail.trim(),
    });
  },
  close: (): void => {
    useConnectAppleStore.setState(initialConnectAppleState);
  },
};

export const resetConnectAppleStoreForTests = (): void => {
  useConnectAppleStore.setState(initialConnectAppleState, true);
};

if (typeof window !== "undefined") {
  window.__COMPASS_E2E_STORE__ = {
    ...window.__COMPASS_E2E_STORE__,
    connectApple: {
      close: connectAppleActions.close,
      getState: useConnectAppleStore.getState,
      open: connectAppleActions.open,
    },
  };
}

export const selectConnectAppleOpen = (state: ConnectAppleState): boolean =>
  state.isOpen;

export const selectConnectAppleInitialEmail = (
  state: ConnectAppleState,
): string => state.initialEmail;
