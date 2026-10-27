type CompleteAuthenticationDependencies = {
  clearAnonymousCalendarChangeSignUpPrompt: () => void;
  markUserAsAuthenticated: (email?: string) => void;
  onEventSourceChanged: () => void;
  refreshUserMetadata: () => Promise<unknown> | unknown;
  resolveShouldSyncPendingLocalEvents: () => Promise<boolean>;
  syncPendingLocalEvents: () => Promise<unknown>;
  waitForAuthSession: () => Promise<boolean>;
  useSession: () => {
    setAuthenticated: (isAuthenticated: boolean) => void;
  };
};

export function createUseCompleteAuthentication(
  dependencies: CompleteAuthenticationDependencies,
) {
  return function useCompleteAuthenticationWithDependencies() {
    const { setAuthenticated } = dependencies.useSession();

    return async ({
      email,
      onComplete,
    }: {
      email?: string;
      onComplete?: () => void;
    }) => {
      const sessionReady = await dependencies.waitForAuthSession();
      if (!sessionReady) {
        throw new Error(
          "Your account was created, but the sign-in session did not start. Refresh and try logging in.",
        );
      }

      dependencies.clearAnonymousCalendarChangeSignUpPrompt();
      dependencies.markUserAsAuthenticated(email);
      setAuthenticated(true);

      void dependencies.refreshUserMetadata();

      if (await dependencies.resolveShouldSyncPendingLocalEvents()) {
        await dependencies.syncPendingLocalEvents();
      }

      dependencies.onEventSourceChanged();
      onComplete?.();
    };
  };
}
