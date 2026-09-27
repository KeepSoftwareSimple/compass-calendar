type CompleteAuthenticationDependencies = {
  clearAnonymousCalendarChangeSignUpPrompt: () => void;
  markUserAsAuthenticated: (email?: string) => void;
  onEventSourceChanged: () => void;
  refreshUserMetadata: () => Promise<unknown> | unknown;
  syncPendingLocalEvents: () => Promise<unknown>;
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
      dependencies.clearAnonymousCalendarChangeSignUpPrompt();
      dependencies.markUserAsAuthenticated(email);
      setAuthenticated(true);

      void dependencies.refreshUserMetadata();

      await dependencies.syncPendingLocalEvents();

      dependencies.onEventSourceChanged();
      onComplete?.();
    };
  };
}
