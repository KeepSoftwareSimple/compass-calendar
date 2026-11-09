import { type ReactNode, useEffect } from "react";
import { UserApi } from "@web/api/user.api";
import { useSession } from "@web/auth/compass/session/useSession";
import { hasUserEverAuthenticated } from "@web/auth/compass/state/auth.state.util";
import { useLoadProfile } from "@web/auth/compass/user/hooks/useLoadProfile";
import { useIdentifyUser } from "@web/auth/posthog/useIdentifyUser";
import { readHiddenCalendarIds } from "@web/calendars/calendar-visibility.storage";
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
  useEffect(() => {
    if (!authenticated || !userId || profile?.isSynthetic) return;
    void UserApi.initializeReflectionPreferences({
      timeZone,
      excludedCalendarIds: [...readHiddenCalendarIds()],
    }).catch(() => {
      console.warn("Calendar review settings could not be initialized");
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
