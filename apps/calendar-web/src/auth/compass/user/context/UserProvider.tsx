import { type ReactNode } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import { hasUserEverAuthenticated } from "@web/auth/compass/state/auth.state.util";
import { useLoadProfile } from "@web/auth/compass/user/hooks/useLoadProfile";
import { useIdentifyUser } from "@web/auth/posthog/useIdentifyUser";
import { UserContext } from "./UserContext";

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const { authenticated } = useSession();
  const hasAuthenticatedBefore = authenticated || hasUserEverAuthenticated();
  const { email, profile, profileEmail, userId } = useLoadProfile(
    hasAuthenticatedBefore,
  );
  useIdentifyUser(profileEmail, userId);

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
