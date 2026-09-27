import { useCallback } from "react";
import { clearAccountScopedClientState } from "@web/auth/compass/session/logout.teardown";
import { session } from "@web/auth/compass/session/Session";
import { useSession } from "@web/auth/compass/session/useSession";
import { clearAuthenticationState } from "@web/auth/compass/state/auth.state.util";
import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";

const SIGN_OUT_TIMEOUT_MS = 4000;

export function useLogout() {
  const { setAuthenticated } = useSession();

  return useCallback(async (): Promise<{ signedOutRemotely: boolean }> => {
    // Clear auth state first, before awaiting signOut. The SIGN_OUT event
    // fires during signOut() and handleSessionMissing reads hasUserEverAuthenticated(),
    // which requires auth state to already be cleared to compute the correct source.
    clearAuthenticationState();

    let signedOutRemotely = false;
    try {
      await Promise.race([
        session.signOut(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Sign-out timeout")),
            SIGN_OUT_TIMEOUT_MS,
          ),
        ),
      ]);
      signedOutRemotely = true;
    } catch (error) {
      console.warn("Failed to complete backend sign-out:", error);
    }

    // Tear down account-scoped state regardless of backend outcome. If signOut
    // failed, handleSessionMissing never ran, so this is the only place that
    // tears down the SSE stream, metadata, and source.
    clearAccountScopedClientState();

    // A deliberate logout, not an expired session (that path is
    // handleSessionMissing, which doesn't call this hook) - safe to detach
    // the device identity so the next person on this browser starts fresh.
    getPosthogClient()?.reset();

    // Signal the UI that local logout is complete.
    setAuthenticated(false);

    return { signedOutRemotely };
  }, [setAuthenticated]);
}
