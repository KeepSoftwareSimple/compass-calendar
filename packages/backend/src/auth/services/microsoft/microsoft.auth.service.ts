import { LoggerFactory } from "@core/logger/logger.factory";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import {
  type ProviderAccountFacts,
  ProviderAccountFactsSchema,
} from "@core/types/sync/connection.contracts";
import { StringV4Schema, zObjectId } from "@core/types/type.utils";
import { type Schema_UserIdentity } from "@core/types/user.types";
import { normalizeEmail } from "@core/util/email.util";
import { emailForVerifiedAccountLinkLookup } from "@backend/auth/services/account-linking.util";
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
  type AuthDecision,
  type MicrosoftSignInSuccess,
} from "./microsoft.auth.types";
import { createHmac } from "node:crypto";

let logger: ReturnType<typeof LoggerFactory> | undefined;
const getLogger = () =>
  (logger ??= LoggerFactory("app:auth.microsoft.service"));
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

export function microsoftSubjectId(
  providerUser: MicrosoftSignInSuccess["providerUser"],
): string {
  const oid =
    typeof providerUser.oid === "string" ? providerUser.oid.trim() : "";
  const sub =
    typeof providerUser.sub === "string" ? providerUser.sub.trim() : "";
  return oid || sub;
}

export function microsoftEmail(
  providerUser: MicrosoftSignInSuccess["providerUser"],
): string {
  const email =
    typeof providerUser.email === "string" ? providerUser.email.trim() : "";
  const preferred =
    typeof providerUser.preferred_username === "string"
      ? providerUser.preferred_username.trim()
      : "";
  return email || preferred;
}

function microsoftIdentity(
  providerUser: MicrosoftSignInSuccess["providerUser"],
  email: string,
): Schema_UserIdentity {
  const subjectId = microsoftSubjectId(providerUser);
  const identity: Schema_UserIdentity = {
    provider: "microsoft",
    subjectId,
    email,
    linkedAt: new Date(),
  };
  const displayName =
    typeof providerUser.name === "string" ? providerUser.name.trim() : "";
  if (displayName) {
    identity.displayName = displayName;
  }
  return identity;
}

function getMicrosoftAuthDecisionTrace({
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
  const microsoftUserTraceId = getTraceId(subjectId);
  const compassUserTraceId = getTraceId(decision.compassUserId);

  return {
    event: "microsoft_auth_decision",
    authMode: decision.authMode,
    createdNewRecipeUser,
    hasCompassUserId: Boolean(decision.compassUserId),
    hasMicrosoftUserId: Boolean(subjectId),
    hasProviderEmail: Boolean(providerEmail),
    loginMethodsLength,
    ...(compassUserTraceId ? { compassUserTraceId } : {}),
    ...(microsoftUserTraceId ? { microsoftUserTraceId } : {}),
    ...(providerEmailTraceId ? { providerEmailTraceId } : {}),
  };
}

function microsoftAccount(
  providerUser: MicrosoftSignInSuccess["providerUser"],
  email: string,
): ProviderAccountFacts {
  return ProviderAccountFactsSchema.parse({
    providerAccountId: microsoftSubjectId(providerUser),
    email,
    displayName:
      typeof providerUser.name === "string" ? providerUser.name : null,
  });
}

function grantedMicrosoftScopes(scope: string | null | undefined): string[] {
  const grantedScopes = (scope ?? "").split(/\s+/).filter(Boolean);
  if (!MICROSOFT_SCOPES.every((required) => grantedScopes.includes(required))) {
    throw error(
      AuthError.InadequatePermissions,
      "Microsoft Calendar permissions are required",
    );
  }
  return grantedScopes;
}

async function adoptConnection(
  compassUserId: string,
  providerUser: MicrosoftSignInSuccess["providerUser"],
  email: string,
  refreshToken: string,
  grantedScopes: readonly string[],
): Promise<void> {
  await adoptProviderAuthorization(
    syncServiceFactory.getSyncServiceClient(),
    toSyncPrincipal(compassUserId),
    {
      provider: "microsoft",
      account: microsoftAccount(providerUser, email),
      refreshToken,
      grantedScopes,
    },
  );
}

async function microsoftSignup(
  providerUser: MicrosoftSignInSuccess["providerUser"],
  email: string,
  refreshToken: string,
  userId: string,
) {
  const existingByEmail = await findCompassUserBy(
    "email",
    normalizeEmail(email),
  );
  if (existingByEmail) {
    throw error(
      AuthError.GoogleSignInWhileAuthenticated,
      authErrorCopy.signInWhileAuthenticated("microsoft"),
    );
  }

  const cUser = await userService.upsertUserFromAuth({
    userId,
    email,
    name: typeof providerUser.name === "string" ? providerUser.name : undefined,
    identities: [microsoftIdentity(providerUser, email)],
  });

  return { cUserId: cUser.user.userId, refreshToken };
}

async function handleMicrosoftAuth(
  success: MicrosoftSignInSuccess,
  options?: { hasExistingSession?: boolean },
): Promise<void> {
  const {
    providerUser,
    oAuthTokens,
    createdNewRecipeUser,
    recipeUserId,
    loginMethodsLength,
  } = success;

  const subjectId = microsoftSubjectId(providerUser);
  if (!subjectId) {
    throw new Error("Microsoft user ID (oid) is required");
  }
  const email = microsoftEmail(providerUser);
  if (!email) {
    throw new Error("Microsoft email is required");
  }
  StringV4Schema.parse(subjectId, {
    error: () => "Invalid Microsoft user ID",
  });
  const scopes = grantedMicrosoftScopes(oAuthTokens.scope);

  const decision = await determineThirdPartyAuthMode(
    "microsoft",
    subjectId,
    emailForVerifiedAccountLinkLookup(email),
    createdNewRecipeUser,
  );

  getLogger().info(
    "microsoft_auth_decision",
    getMicrosoftAuthDecisionTrace({
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
          authErrorCopy.signInWhileAuthenticated("microsoft"),
        );
      }

      const refreshToken = oAuthTokens.refresh_token;
      if (!refreshToken) {
        throw error(
          AuthError.GoogleRefreshTokenMissing,
          "Refresh token expected for new user sign-up",
        );
      }

      const persisted = await microsoftSignup(
        providerUser,
        email,
        refreshToken,
        recipeUserId,
      );
      await adoptConnection(
        persisted.cUserId,
        providerUser,
        email,
        persisted.refreshToken,
        scopes,
      );
      return;
    }

    case "SIGNIN": {
      const compassUserId = decision.compassUserId;
      if (!compassUserId) {
        throw new Error("Compass user ID expected for Microsoft sign-in");
      }
      zObjectId.parse(compassUserId);

      await userService.upsertUserFromAuth({
        userId: compassUserId,
        email,
        name:
          typeof providerUser.name === "string" ? providerUser.name : undefined,
        identities: [microsoftIdentity(providerUser, email)],
      });

      const refreshToken = oAuthTokens.refresh_token;
      if (refreshToken) {
        await adoptConnection(
          compassUserId,
          providerUser,
          email,
          refreshToken,
          scopes,
        );
      }
      return;
    }
  }
}

export const microsoftAuthService = {
  microsoftSignup,
  handleMicrosoftAuth,
};
