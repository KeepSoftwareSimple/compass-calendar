import { type PropsWithChildren, useEffect, useSyncExternalStore } from "react";
import SuperTokens from "supertokens-web-js";
import EmailPassword from "supertokens-web-js/recipe/emailpassword";
import Session from "supertokens-web-js/recipe/session";
import ThirdParty from "supertokens-web-js/recipe/thirdparty";
import { APP_NAME } from "@core/constants/core.constants";
import { session } from "@web/auth/compass/session/Session";
import {
  getLastKnownEmail,
  markUserAsAuthenticated,
} from "@web/auth/compass/state/auth.state.util";
import { clearGoogleSyncIndicatorOverride } from "@web/auth/providers/sync.indicator.state";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { createExternalStore } from "@web/common/utils/external-store.util";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import * as sse from "@web/sse/client/sse.client";
import { refreshUserMetadata } from "../user/util/user-metadata.util";
import { SessionContext } from "./session.context";

SuperTokens.init({
  appInfo: {
    appName: APP_NAME,
    apiDomain: ENV_WEB.BACKEND_BASEURL,
    apiBasePath: ROOT_ROUTES.API,
  },
  recipeList: [
    ThirdParty.init(),
    EmailPassword.init(),
    // No EmailVerification recipe: the backend doesn't init it either, so a
    // web-side init only produced verify links that dead-ended.
    Session.init({
      // Session lifecycle only. postAPIHook shares action names
      // (REFRESH_SESSION) with onHandleEvent but is an HTTP-hook payload,
      // not a successful session refresh.
      onHandleEvent: (event) => {
        session.emit(event);
      },
    }),
  ],
});

const authStore = createExternalStore(false);
let isCheckingSession = false;
let isSessionInitialized = false;
let sessionEventVersion = 0;

const handleAuthenticatedSession = () => {
  authStore.set(true);
  markUserAsAuthenticated(getLastKnownEmail());
  void refreshUserMetadata();
};

const handleSessionExists = () => {
  handleAuthenticatedSession();
  refreshEventRepositorySource(true);
  if (!sse.getStream()) {
    sse.openStream();
  }
};

const handleSessionMissing = () => {
  authStore.set(false);
  refreshEventRepositorySource(false);
  userMetadataActions.clear();
  clearGoogleSyncIndicatorOverride();
};

async function checkIfSessionExists(): Promise<boolean> {
  // Skip real session check in e2e tests — tests control auth state via the
  // e2e store bridge. Running SuperTokens session checks races against those
  // updates and resets state.
  if (typeof window !== "undefined" && window.__COMPASS_E2E_TEST__) {
    return false;
  }

  if (isCheckingSession) return authStore.get();

  isCheckingSession = true;
  const eventVersionAtCheckStart = sessionEventVersion;

  try {
    const exists = await session.doesSessionExist();

    if (sessionEventVersion !== eventVersionAtCheckStart) {
      return authStore.get();
    }

    if (exists) {
      handleSessionExists();
    } else {
      handleSessionMissing();
    }

    return exists;
  } catch (error) {
    console.error("Error checking auth status:", error);
    authStore.set(false);
    return false;
  } finally {
    isCheckingSession = false;
  }
}

export function sessionInit() {
  if (isSessionInitialized) {
    return;
  }

  isSessionInitialized = true;
  void checkIfSessionExists();

  let lastAction: string | undefined;

  // No need to unsubscribe as this runs for the lifetime of the app
  session.onAnyEvent((e) => {
    if (e.action === lastAction) return;
    lastAction = e.action;

    switch (e.action) {
      case "REFRESH_SESSION":
      case "SESSION_CREATED":
        sessionEventVersion += 1;
        // Mark user as authenticated when session is created or refreshed
        // This ensures the flag is set even if markUserAsAuthenticated wasn't called during OAuth
        handleAuthenticatedSession();
        sse.closeStream();
        sse.openStream();
        break;
      case "SIGN_OUT":
        sessionEventVersion += 1;
        handleSessionMissing();
        sse.closeStream();
        break;
      default:
        void checkIfSessionExists();
    }
  });
}

export function SessionProvider({ children }: PropsWithChildren<object>) {
  const authenticated = useSyncExternalStore(
    authStore.subscribe,
    authStore.get,
  );

  // Expose test hooks for e2e testing
  useEffect(() => {
    if (typeof window !== "undefined" && window.__COMPASS_E2E_TEST__) {
      window.__COMPASS_E2E_HOOKS__ = {
        setAuthenticated: (value: boolean) => authStore.set(value),
      };
    }
  }, []);

  return (
    <SessionContext.Provider
      value={{
        authenticated,
        setAuthenticated: (value: boolean) => authStore.set(value),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
