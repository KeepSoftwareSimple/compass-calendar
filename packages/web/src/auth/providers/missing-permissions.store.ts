import { create } from "zustand";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

export type MissingPermissionsState = {
  provider: ProviderKind | null;
};

const initialMissingPermissionsState: MissingPermissionsState = {
  provider: null,
};

export const useMissingPermissionsStore = create<MissingPermissionsState>(
  () => initialMissingPermissionsState,
);

export const missingPermissionsActions = {
  open: (provider: ProviderKind): void => {
    useMissingPermissionsStore.setState({ provider });
  },
  close: (): void => {
    useMissingPermissionsStore.setState(initialMissingPermissionsState);
  },
};

export const resetMissingPermissionsStoreForTests = (): void => {
  useMissingPermissionsStore.setState(initialMissingPermissionsState, true);
};

if (typeof window !== "undefined") {
  window.__COMPASS_E2E_STORE__ = {
    ...window.__COMPASS_E2E_STORE__,
    missingPermissions: {
      close: missingPermissionsActions.close,
      getState: useMissingPermissionsStore.getState,
      open: missingPermissionsActions.open,
    },
  };
}

export const selectMissingPermissionsProvider = (
  state: MissingPermissionsState,
): ProviderKind | null => state.provider;
