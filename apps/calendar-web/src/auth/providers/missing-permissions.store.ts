import { create } from "zustand";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

export type MissingPermissionsSurface =
  | "connect_modal"
  | "google_signup_recovery";

export type MissingPermissionsState = {
  provider: ProviderKind | null;
  surface: MissingPermissionsSurface | null;
  missingScopes: readonly string[];
};

const initialMissingPermissionsState: MissingPermissionsState = {
  provider: null,
  surface: null,
  missingScopes: [],
};

export const useMissingPermissionsStore = create<MissingPermissionsState>(
  () => initialMissingPermissionsState,
);

export const missingPermissionsActions = {
  open: (provider: ProviderKind): void => {
    useMissingPermissionsStore.setState({
      provider,
      surface: "connect_modal",
      missingScopes: [],
    });
  },
  openGoogleSignupRecovery: (missingScopes: readonly string[]): void => {
    useMissingPermissionsStore.setState({
      provider: "google",
      surface: "google_signup_recovery",
      missingScopes,
    });
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
      openGoogleSignupRecovery:
        missingPermissionsActions.openGoogleSignupRecovery,
    },
  };
}

export const selectMissingPermissionsProvider = (
  state: MissingPermissionsState,
): ProviderKind | null => state.provider;

export const selectMissingPermissionsSurface = (
  state: MissingPermissionsState,
): MissingPermissionsSurface | null => state.surface;

export const selectMissingPermissionsMissingScopes = (
  state: MissingPermissionsState,
): readonly string[] => state.missingScopes;

export const selectIsMissingPermissionsOpen = (
  state: MissingPermissionsState,
): boolean => state.surface !== null;
