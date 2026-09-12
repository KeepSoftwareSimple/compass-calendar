import { LoggerFactory } from "@core/logger/logger.factory";
import {
  type ProviderAccountFacts,
  ProviderAccountFactsSchema,
} from "@core/types/sync/connection.contracts";
import { StringV4Schema, zObjectId } from "@core/types/type.utils";
import { type Schema_UserIdentity } from "@core/types/user.types";
import { normalizeEmail } from "@core/util/email.util";
import { emailForVerifiedAccountLinkLookup } from "@backend/auth/services/account-linking.util";
import {
  grantedScopesIncludeCalendarAccess,
  parseGrantedScopes,
} from "@backend/auth/services/calendar-grant.util";
import { determineThirdPartyAuthMode } from "@backend/auth/services/google/util/google.auth.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import {
  AuthError,
  authErrorCopy,
} from "@backend/common/errors/auth/auth.errors";
import { error } from "@backend/common/errors/handlers/error.handler";
import { adoptProviderAuthorization } from "@backend/common/services/sync-service/sync-connection-adoption";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import { findCompassUserBy } from "@backend/user/queries/user.queries";
import userService from "@backend/user/services/user.service";
import {
  type AppleIdTokenPayload,
  type AppleSignInSuccess,
  type AuthDecision,
} from "./apple.auth.types";
import { createHmac } from "node:crypto";

let logger: ReturnType<typeof LoggerFactory> | undefined;
const getLogger = () => (logger ??= LoggerFactory("app:auth.apple.service"));
const AUTH_TRACE_ID_LENGTH = 16;

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

export function appleSubjectId(providerUser: AppleIdTokenPayload): string {
  return typeof providerUser.sub === "string" ? providerUser.sub.trim() : "";
}

export function appleEmail(providerUser: AppleIdTokenPayload): string {
  return typeof providerUser.email === "string"
    ? providerUser.email.trim()
    : "";
}

export function appleDisplayName(
  providerUser: AppleIdTokenPayload,
): string | undefined {
  if (typeof providerUser.name === "string" && providerUser.name.trim()) {
    return providerUser.name.trim();
  }
  const first = providerUser.user?.name?.firstName?.trim() ?? "";
  const last = providerUser.user?.name?.lastName?.trim() ?? "";
  const combined = `${first} ${last}`.trim();
  return combined || undefined;
}

function appleAccount(
  providerUser: AppleIdTokenPayload,
  email: string,
): ProviderAccountFacts {
  return ProviderAccountFactsSchema.parse({
    providerAccountId: appleSubjectId(providerUser),
    email,
    displayName: appleDisplayName(providerUser) ?? null,
  });
}

function appleIdentity(
  providerUser: AppleIdTokenPayload,
  email: string,
): Schema_UserIdentity {
  const identity: Schema_UserIdentity = {
    provider: "apple",
    subjectId: appleSubjectId(providerUser),
    email,
    linkedAt: new Date(),
  };
  const displayName = appleDisplayName(providerUser);
  if (displayName) {
    identity.displayName = displayName;
  }
  return identity;
}

function getAppleAuthDecisionTrace({
  createdNewRecipeUser,
  decision,
  subjectId,
  loginMethodsLength,
  providerEmail,
}: {
  createdNewRecipeUser: boolean;
  decision: AuthDecision;
  subjectId: string;
  loginMethodsLength: number;
  providerEmail: string | null | undefined;
}) {
  const providerEmailTraceId = providerEmail
    ? getTraceId(normalizeEmail(providerEmail))
    : undefined;
  const appleUserTraceId = getTraceId(subjectId);
  const compassUserTraceId = getTraceId(decision.compassUserId);

  return {
    event: "apple_auth_decision",
    authMode: decision.authMode,
    createdNewRecipeUser,
    hasCompassUserId: Boolean(decision.compassUserId),
    hasAppleUserId: Boolean(subjectId),
    hasProviderEmail: Boolean(providerEmail),
    loginMethodsLength,
    ...(compassUserTraceId ? { compassUserTraceId } : {}),
    ...(appleUserTraceId ? { appleUserTraceId } : {}),
    ...(providerEmailTraceId ? { providerEmailTraceId } : {}),
  };
}

async function adoptIfCalendarGranted(
  compassUserId: string,
  providerUser: AppleIdTokenPayload,
  email: string,
  refreshToken: string | undefined,
  grantedScopes: readonly string[],
): Promise<void> {
  if (!grantedScopesIncludeCalendarAccess(grantedScopes) || !refreshToken) {
    return;
  }

  await adoptProviderAuthorization(
    syncServiceFactory.getSyncServiceClient(),
    toSyncPrincipal(compassUserId),
    {
      provider: "apple",
      account: appleAccount(providerUser, email),
      refreshToken,
      grantedScopes,
    },
  );
}

async function appleSignup(
  providerUser: AppleIdTokenPayload,
  email: string,
  userId: string,
) {
  const existingByEmail = await findCompassUserBy(
    "email",
    normalizeEmail(email),
  );
  if (existingByEmail) {
    throw error(
      AuthError.GoogleSignInWhileAuthenticated,
      authErrorCopy.signInWhileAuthenticated("apple"),
    );
  }

  const cUser = await userService.upsertUserFromAuth({
    userId,
    email,
    name: appleDisplayName(providerUser),
    identities: [appleIdentity(providerUser, email)],
  });

  return { cUserId: cUser.user.userId };
}

async function handleAppleAuth(
  success: AppleSignInSuccess,
  options?: { hasExistingSession?: boolean },
): Promise<void> {
  const {
    providerUser,
    oAuthTokens,
    createdNewRecipeUser,
    recipeUserId,
    loginMethodsLength,
  } = success;

  const subjectId = appleSubjectId(providerUser);
  if (!subjectId) {
    throw new Error("Apple user ID (sub) is required");
  }
  const email = appleEmail(providerUser);
  if (!email) {
    throw new Error("Apple email is required");
  }
  StringV4Schema.parse(subjectId, {
    error: () => "Invalid Apple user ID",
  });
  const scopes = parseGrantedScopes(oAuthTokens.scope);

  const decision = await determineThirdPartyAuthMode(
    "apple",
    subjectId,
    emailForVerifiedAccountLinkLookup(email),
    createdNewRecipeUser,
  );

  getLogger().info(
    "apple_auth_decision",
    getAppleAuthDecisionTrace({
      createdNewRecipeUser,
      decision,
      subjectId,
      loginMethodsLength,
      providerEmail: email,
    }),
  );

  switch (decision.authMode) {
    case "SIGNUP": {
      if (options?.hasExistingSession) {
        throw error(
          AuthError.GoogleSignInWhileAuthenticated,
          authErrorCopy.signInWhileAuthenticated("apple"),
        );
      }

      const persisted = await appleSignup(providerUser, email, recipeUserId);
      await adoptIfCalendarGranted(
        persisted.cUserId,
        providerUser,
        email,
        oAuthTokens.refresh_token,
        scopes,
      );
      return;
    }

    case "SIGNIN": {
      const compassUserId = decision.compassUserId;
      if (!compassUserId) {
        throw new Error("Compass user ID expected for Apple sign-in");
      }
      zObjectId.parse(compassUserId);

      await userService.upsertUserFromAuth({
        userId: compassUserId,
        email,
        name: appleDisplayName(providerUser),
        identities: [appleIdentity(providerUser, email)],
      });

      await adoptIfCalendarGranted(
        compassUserId,
        providerUser,
        email,
        oAuthTokens.refresh_token,
        scopes,
      );
      return;
    }
  }
}

export const appleAuthService = {
  appleSignup,
  handleAppleAuth,
};
