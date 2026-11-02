import { create } from "zustand";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

export type MissingPermissionsSurface =
  | "connect_modal"
  | "google_signup_recovery";

export type MissingPermissionsState = {
  provider: ProviderKind | null;
  surface: MissingPermissionsSurface | null;
  missingScopes: readonly string[];
  /** Whether the failed OAuth attempt started from signup (so the retry lands on the trial step). */
  signupFlow: boolean;
};

const initialMissingPermissionsState: MissingPermissionsState = {
  provider: null,
  surface: null,
  missingScopes: [],
  signupFlow: false,
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
      signupFlow: false,
    });
  },
  /**
   * Short "needs calendar access" screen with a one-click incremental retry.
   * Used for every Google sign-in that came back short on scopes, from signup
   * or log in; `signupFlow` keeps the retry on the same path it started on.
   */
  openGoogleSignupRecovery: (
    missingScopes: readonly string[],
    options: { signupFlow?: boolean } = {},
  ): void => {
    useMissingPermissionsStore.setState({
      provider: "google",
      surface: "google_signup_recovery",
      missingScopes,
      signupFlow: options.signupFlow ?? true,
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

export const selectMissingPermissionsSignupFlow = (
  state: MissingPermissionsState,
): boolean => state.signupFlow;

export const selectIsMissingPermissionsOpen = (
  state: MissingPermissionsState,
): boolean => state.surface !== null;
