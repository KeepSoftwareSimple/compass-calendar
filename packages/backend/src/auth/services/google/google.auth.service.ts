import { type Credentials, type TokenPayload } from "google-auth-library";
import { LoggerFactory } from "@core/logger/logger.factory";
import {
  type ProviderAccountFacts,
  ProviderAccountFactsSchema,
} from "@core/types/sync/connection.contracts";
import { StringV4Schema, zObjectId } from "@core/types/type.utils";
import { normalizeEmail } from "@core/util/email.util";
import {
  determineGoogleAuthMode,
  parseReconnectGoogleParams,
} from "@backend/auth/services/google/util/google.auth.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import { AuthError } from "@backend/common/errors/auth/auth.errors";
import { error } from "@backend/common/errors/handlers/error.handler";
import mongoService from "@backend/common/services/mongo.service";
import { adoptGoogleAuthorization } from "@backend/common/services/sync-service/sync-connection-adoption";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import userService from "@backend/user/services/user.service";
import { GOOGLE_AUTH_SCOPES } from "./google.auth.scopes";
import {
  type AuthDecision,
  type GoogleSignInSuccess,
} from "./google.auth.types";
import { createHmac } from "node:crypto";

// Resolved lazily (not at module scope) so the test logger factory registered
// after import still wins, then memoized: the production factory builds a
// fresh winston logger — including a new file-transport handle — on every
// call, and this ran twice per Google sign-in.
let logger: ReturnType<typeof LoggerFactory> | undefined;
const getLogger = () => (logger ??= LoggerFactory("app:auth.google.service"));
const AUTH_TRACE_ID_LENGTH = 16;

// Keep auth traces searchable without putting raw user identifiers in production logs.
function getTraceId(value: string | null | undefined): string | undefined {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return undefined;
  }

  return createHmac("sha256", CONFIG.TOKEN_COMPASS_SYNC)
    .update(normalizedValue)
    .digest("hex")
    .slice(0, AUTH_TRACE_ID_LENGTH);
}

function getGoogleAuthDecisionTrace({
  createdNewRecipeUser,
  decision,
  googleUserId,
  loginMethodsLength,
  providerEmail,
}: {
  createdNewRecipeUser: boolean;
  decision: AuthDecision;
  googleUserId: string;
  loginMethodsLength: number;
  providerEmail: string | null | undefined;
}) {
  const providerEmailTraceId = providerEmail
    ? getTraceId(normalizeEmail(providerEmail))
    : undefined;
  const googleUserTraceId = getTraceId(googleUserId);
  const compassUserTraceId = getTraceId(decision.compassUserId);

  return {
    event: "google_auth_decision",
    authMode: decision.authMode,
    createdNewRecipeUser,
    hasCompassUserId: Boolean(decision.compassUserId),
    hasGoogleUserId: Boolean(googleUserId),
    hasProviderEmail: Boolean(providerEmail),
    loginMethodsLength,
    ...(compassUserTraceId ? { compassUserTraceId } : {}),
    ...(googleUserTraceId ? { googleUserTraceId } : {}),
    ...(providerEmailTraceId ? { providerEmailTraceId } : {}),
  };
}

async function persistGoogleConnection(
  compassUserId: string,
  gUser: TokenPayload,
  refreshToken: string,
) {
  // Profile facts only (googleId, picture, lastLoggedInAt). The refresh token
  // itself goes to Sync via adoptConnection - Sync's credential store is the
  // single authority; the legacy user.google.gRefreshToken slot is dead (it
  // could hold only ONE account's token, so under multi-account it silently
  // dropped every other account's).
  await userService.refreshGoogleProfile(compassUserId, gUser);

  return { cUserId: compassUserId, refreshToken };
}

async function persistStoredGoogleConnection(
  compassUserId: string,
  gUser: TokenPayload,
) {
  const cUserId = zObjectId.parse(compassUserId).toString();
  StringV4Schema.parse(gUser.sub, {
    error: () => "Invalid Google user ID",
  });

  await userService.refreshGoogleProfile(cUserId, gUser);

  // Google returned no refresh token on this returning sign-in, and the
  // legacy Mongo copy is retired. There is nothing to adopt: either Sync
  // already holds a live connection for this account (the common case -
  // adoption would be a no-op anyway), or the user's connection is genuinely
  // dead and the reconnect flow (which forces consent and yields a fresh
  // token) is the only real fix. Sign-in itself proceeds.
  return { cUserId, refreshToken: null };
}

async function googleSignup(
  gUser: TokenPayload,
  refreshToken: string,
  userId: string,
) {
  const session = await mongoService.startSession();

  try {
    return await session.withTransaction(async (transactionSession) => {
      const cUser = await userService.upsertUserFromAuth(
        {
          userId,
          email: gUser.email ?? "",
          name: gUser.name || undefined,
          locale: gUser.locale || undefined,
          google: {
            googleId: gUser.sub ?? "",
            picture: gUser.picture || "not provided",
          },
        },
        transactionSession,
      );

      return { cUserId: cUser.user.userId, refreshToken };
    });
  } finally {
    await session.endSession();
  }
}

async function repairGoogleConnection(
  compassUserId: string,
  gUser: TokenPayload,
  oAuthTokens: Pick<Credentials, "refresh_token" | "access_token">,
) {
  if (!oAuthTokens.refresh_token) {
    return persistStoredGoogleConnection(compassUserId, gUser);
  }

  const {
    cUserId,
    gUser: validatedGUser,
    refreshToken,
  } = parseReconnectGoogleParams(compassUserId, gUser, oAuthTokens);

  return persistGoogleConnection(cUserId, validatedGUser, refreshToken);
}

function googleAccount(providerUser: TokenPayload): ProviderAccountFacts {
  return ProviderAccountFactsSchema.parse({
    providerAccountId: providerUser.sub,
    email: providerUser.email ?? null,
    displayName: providerUser.name ?? null,
  });
}

function grantedGoogleScopes(scope: string | null | undefined): string[] {
  const grantedScopes = (scope ?? "").split(/\s+/).filter(Boolean);
  if (
    !GOOGLE_AUTH_SCOPES.every((required) => grantedScopes.includes(required))
  ) {
    throw error(
      AuthError.InadequatePermissions,
      "Google Calendar permissions are required",
    );
  }
  return grantedScopes;
}

async function adoptConnection(
  compassUserId: string,
  providerUser: TokenPayload,
  refreshToken: string,
  grantedScopes: readonly string[],
): Promise<void> {
  const request = {
    account: googleAccount(providerUser),
    refreshToken,
    grantedScopes,
  };
  await adoptGoogleAuthorization(
    syncServiceFactory.getSyncServiceClient(),
    toSyncPrincipal(compassUserId),
    request,
  );
}

async function handleGoogleAuth(
  success: GoogleSignInSuccess,
  options?: { hasExistingSession?: boolean },
): Promise<void> {
  const {
    providerUser,
    oAuthTokens,
    createdNewRecipeUser,
    recipeUserId,
    loginMethodsLength,
  } = success;

  const googleUserId = providerUser.sub;
  if (!googleUserId) {
    throw new Error("Google user ID (sub) is required");
  }
  const scopes = grantedGoogleScopes(oAuthTokens.scope);

  // Determine auth mode based on server-side state
  const decision = await determineGoogleAuthMode(
    googleUserId,
    providerUser.email,
    createdNewRecipeUser,
  );

  getLogger().info(
    "google_auth_decision",
    getGoogleAuthDecisionTrace({
      createdNewRecipeUser,
      decision,
      googleUserId,
      loginMethodsLength,
      providerEmail: providerUser.email,
    }),
  );

  switch (decision.authMode) {
    case "SIGNUP": {
      if (options?.hasExistingSession) {
        throw error(
          AuthError.GoogleSignInWhileAuthenticated,
          "You're already signed in. Use Settings → Add account to connect this Google account.",
        );
      }
      const isNewUser = createdNewRecipeUser && loginMethodsLength === 1;
      if (!isNewUser) {
        // Edge case: no Compass user found but SuperTokens says not new
        // This shouldn't happen in normal flow, treat as signup
        getLogger().warn("No Compass user found but isNewUser is false", {
          google_user_id: googleUserId,
          recipe_user_id: recipeUserId,
          created_new_recipe_user: createdNewRecipeUser,
          login_methods_length: loginMethodsLength,
        });
      }

      const refreshToken = oAuthTokens.refresh_token;
      if (!refreshToken) {
        // Google omits a refresh token when this browser already consented
        // once before (e.g. an earlier signup attempt reached Google's
        // consent screen but failed after, before Compass finished linking).
        // A typed, client-visible code (not a bare Error) so the web client
        // can retry with prompt=consent instead of leaving the user stuck
        // retrying the exact same silent-refusal forever.
        throw error(
          AuthError.GoogleRefreshTokenMissing,
          "Refresh token expected for new user sign-up",
        );
      }

      const persisted = await googleAuthService.googleSignup(
        providerUser,
        refreshToken,
        recipeUserId,
      );
      await adoptConnection(
        persisted.cUserId,
        providerUser,
        persisted.refreshToken,
        scopes,
      );
      return;
    }

    case "SIGNIN": {
      // Returning user - repairGoogleConnection refreshes profile facts and
      // reports the fresh refresh token when Google returned one (adopted
      // into Sync below), or null when it did not.
      const compassUserId = decision.compassUserId;
      if (!compassUserId) {
        throw new Error("Compass user ID expected for Google sign-in");
      }

      const persisted = await googleAuthService.repairGoogleConnection(
        compassUserId,
        providerUser,
        oAuthTokens,
      );
      // No refresh token on a returning sign-in means nothing to adopt: Sync
      // either already holds a live connection for this account, or the user
      // must run the reconnect flow (which forces consent) to mint one.
      if (persisted.refreshToken !== null) {
        await adoptConnection(
          persisted.cUserId,
          providerUser,
          persisted.refreshToken,
          scopes,
        );
      }
      return;
    }
  }
}

export const googleAuthService = {
  googleSignup,
  repairGoogleConnection,
  handleGoogleAuth,
};
