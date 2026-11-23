import { type ReactNode, useEffect, useRef } from "react";
import { UserApi } from "@web/api/user.api";
import { useSession } from "@web/auth/compass/session/useSession";
import { hasUserEverAuthenticated } from "@web/auth/compass/state/auth.state.util";
import { useLoadProfile } from "@web/auth/compass/user/hooks/useLoadProfile";
import { useIdentifyUser } from "@web/auth/posthog/useIdentifyUser";
import { readHiddenCalendarIds } from "@web/calendars/calendar-visibility.storage";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import {
  clearPendingReflectionOptIn,
  peekPendingReflectionOptIn,
} from "@web/components/WelcomeModal/pending-reflection-opt-in";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { UserContext } from "./UserContext";

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { authenticated } = useSession();
  const hasAuthenticatedBefore = authenticated || hasUserEverAuthenticated();
  const { email, profile, profileEmail, userId } = useLoadProfile(
    hasAuthenticatedBefore,
  );
  useIdentifyUser(profileEmail, userId, profile?.isSynthetic);
  const timeZone = useEffectiveTimeZone();
  const enrolling = useRef(false);
  // The sign-up toggle was on: enroll now that there is an account to enroll.
  // Keep the choice until the save works, so a failure is retried next load.
  useEffect(() => {
    if (!authenticated || !userId || profile?.isSynthetic) return;
    if (enrolling.current || !peekPendingReflectionOptIn()) return;
    enrolling.current = true;
    void UserApi.saveReflectionPreferences({
      enabled: true,
      timeZone,
      excludedCalendarIds: [...readHiddenCalendarIds()],
    })
      .then(clearPendingReflectionOptIn)
      .catch(() => {
        showErrorToast(
          "Weekly reflections could not be turned on. Try again in Settings.",
        );
      })
      .finally(() => {
        enrolling.current = false;
      });
  }, [authenticated, userId, profile?.isSynthetic, timeZone]);
  return (
    <UserContext.Provider
      value={{
        ...(profile ?? {}),
        email: email ?? undefined,
        userId: userId ?? undefined,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
