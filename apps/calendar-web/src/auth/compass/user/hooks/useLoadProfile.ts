import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Status } from "@core/errors/status.codes";
import { type UserProfile } from "@core/types/user.types";
import { UserApi } from "@web/api/user.api";
import { isBackendUnavailableError } from "@web/api/util/backend-unavailable-error.util";
import {
  getLastKnownEmail,
  hasUserEverAuthenticated,
  markUserAsAuthenticated,
} from "@web/auth/compass/state/auth.state.util";
import { showSessionExpiredToast } from "@web/common/utils/toast/error-toast.util";
import { openAuthModalFromOutsideRouter } from "@web/common/utils/toast/session-expired.toast";

export type UseLoadProfileResult = {
  email: string | null;
  profile: UserProfile | null;
  profileEmail: string | null;
  userId: string | null;
};

/**
 * Fetches the authenticated user profile when `hasAuthenticatedBefore` is true.
 * While loading, exposes the last known email from storage when available.
 */
export function useLoadProfile(
  hasAuthenticatedBefore: boolean,
): UseLoadProfileResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingUser, setIsLoadingUser] = useState(hasAuthenticatedBefore);
  const profileRequest = useRef<Promise<void> | null>(null);
  const isAuthenticatedRef = useRef(hasAuthenticatedBefore);
  isAuthenticatedRef.current = hasAuthenticatedBefore;
  const userId = profile?.userId ?? null;
  const profileEmail = profile?.email ?? null;
  const email =
    profileEmail ??
    (profile === null && isLoadingUser ? (getLastKnownEmail() ?? null) : null);

  const loadProfile = useCallback(() => {
    if (profileRequest.current) {
      return profileRequest.current;
    }

    setIsLoadingUser(true);

    profileRequest.current = UserApi.getProfile()
      .then((userProfile) => {
        // Signed out while this request was in flight — drop the stale response.
        if (!isAuthenticatedRef.current) return;
        setProfile(userProfile);
        markUserAsAuthenticated(userProfile.email);
      })
      .catch((e) => {
        const status = (e as { response?: { status?: number } })?.response
          ?.status;
        const isUnauthorized =
          status === Status.UNAUTHORIZED || status === Status.FORBIDDEN;

        if (isUnauthorized) {
          if (hasUserEverAuthenticated()) {
            showSessionExpiredToast();
            // The calendar behind the toast shows local demo events, which a
            // returning user reads as lost data — and a dismissed toast would
            // strand them there. Seat the login form front and center instead.
            void openAuthModalFromOutsideRouter("login");
          }
          return;
        }

        if (isBackendUnavailableError(e)) {
          return;
        }

        console.error("Failed to get user profile", e);
      })
      .finally(() => {
        profileRequest.current = null;
        setIsLoadingUser(false);
      });

    return profileRequest.current;
  }, []);

  useLayoutEffect(() => {
    if (!hasAuthenticatedBefore) {
      setProfile(null);
      setIsLoadingUser(false);
      return;
    }

    if (profile) return;

    void loadProfile();
  }, [hasAuthenticatedBefore, loadProfile, profile]);

  return {
    email,
    profile,
    profileEmail,
    userId,
  };
}
