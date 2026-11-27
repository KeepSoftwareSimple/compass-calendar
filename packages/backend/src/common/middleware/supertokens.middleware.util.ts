import { ObjectId } from "mongodb";
import { type SessionContainerInterface } from "supertokens-node/recipe/session/types";
import {
  BillingPlanIntervalSchema,
  BillingPromotionCodeSchema,
} from "@core/types/billing.types";
import { getUserIdMappingStore } from "@backend/auth/ports/supertokens.registry";
import { type AppleSignInSuccess } from "@backend/auth/services/apple/apple.auth.types";
import { type GoogleSignInSuccess } from "@backend/auth/services/google/google.auth.types";
import { type MicrosoftSignInSuccess } from "@backend/auth/services/microsoft/microsoft.auth.types";
import {
  type AuthFormField,
  type CreateAppleSignInResponse,
  type CreateGoogleSignInResponse,
  type CreateMicrosoftSignInResponse,
  type EmailPasswordAuthInput,
  type EmailPasswordAuthResponse,
  type ThirdPartySignInUpInput,
} from "./supertokens.middleware.types";

export function getFormFieldValue(
  formFields: AuthFormField[],
  id: string,
): string | undefined {
  const field = formFields.find((item) => item.id === id);
  return typeof field?.value === "string" ? field.value : undefined;
}

export function buildResetPasswordLink(
  passwordResetLink: string,
  frontendUrl: string,
  checkout?: string,
): string {
  const url = new URL(passwordResetLink);
  const token = url.searchParams.get("token");

  if (!token) {
    return passwordResetLink;
  }

  const appUrl = new URL(
    `${frontendUrl}${checkout?.startsWith("?") ? "/checkout" : "/day"}`,
  );
  if (checkout?.startsWith("?")) {
    const search = new URLSearchParams(checkout);
    const plan = BillingPlanIntervalSchema.safeParse(search.get("plan")).data;
    const promo = BillingPromotionCodeSchema.safeParse(
      search.get("promo"),
    ).data;
    if (plan) appUrl.searchParams.set("plan", plan);
    if (promo) appUrl.searchParams.set("promo", promo);
  }
  appUrl.searchParams.set("auth", "reset");
  appUrl.searchParams.set("token", token);

  return appUrl.toString();
}

export async function ensureExternalUserIdMapping(
  recipeUserId: string,
): Promise<string> {
  const existingMapping = await getUserIdMappingStore().getUserIdMapping({
    userId: recipeUserId,
    userIdType: "SUPERTOKENS",
  });

  if (existingMapping.status === "OK") {
    return existingMapping.externalUserId;
  }

  const externalUserId = new ObjectId().toString();
  await getUserIdMappingStore().createUserIdMapping({
    superTokensUserId: recipeUserId,
    externalUserId,
  });

  return externalUserId;
}

export function createGoogleSignInSuccess(
  response: CreateGoogleSignInResponse,
): GoogleSignInSuccess | null {
  if (response.status !== "OK") return null;

  return {
    providerUser: response.rawUserInfoFromProvider.fromIdTokenPayload,
    oAuthTokens: response.oAuthTokens,
    createdNewRecipeUser: response.createdNewRecipeUser,
    recipeUserId: response.session?.getUserId() ?? response.user.id,
    loginMethodsLength: response.user.loginMethods.length,
  };
}

export function createMicrosoftSignInSuccess(
  response: CreateMicrosoftSignInResponse,
): MicrosoftSignInSuccess | null {
  if (response.status !== "OK") return null;

  const payload = response.rawUserInfoFromProvider.fromIdTokenPayload ?? {};

  return {
    providerUser: {
      oid: typeof payload["oid"] === "string" ? payload["oid"] : undefined,
      sub: typeof payload["sub"] === "string" ? payload["sub"] : undefined,
      email:
        typeof payload["email"] === "string" ? payload["email"] : undefined,
      preferred_username:
        typeof payload["preferred_username"] === "string"
          ? payload["preferred_username"]
          : undefined,
      name: typeof payload["name"] === "string" ? payload["name"] : undefined,
    },
    oAuthTokens: response.oAuthTokens,
    createdNewRecipeUser: response.createdNewRecipeUser,
    recipeUserId: response.session?.getUserId() ?? response.user.id,
    loginMethodsLength: response.user.loginMethods.length,
  };
}

function appleUserFromPayload(
  payload: Record<string, unknown>,
): AppleSignInSuccess["providerUser"]["user"] {
  const raw = payload["user"] ?? payload;
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const name =
    "name" in raw && raw.name && typeof raw.name === "object"
      ? (raw.name as { firstName?: unknown; lastName?: unknown })
      : undefined;
  const firstName =
    typeof name?.firstName === "string" ? name.firstName : undefined;
  const lastName =
    typeof name?.lastName === "string" ? name.lastName : undefined;
  if (!firstName && !lastName) {
    return undefined;
  }
  return { name: { firstName, lastName } };
}

export function appleUserFromFormField(
  raw: string | undefined,
): AppleSignInSuccess["providerUser"]["user"] {
  if (!raw?.trim()) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return appleUserFromPayload(parsed as Record<string, unknown>);
  } catch {
    return undefined;
  }
}

export function withAppleFirstAuthorizationName(
  success: AppleSignInSuccess,
  formUserJson?: string,
): AppleSignInSuccess {
  if (success.providerUser.name?.trim() || success.providerUser.user) {
    return success;
  }
  const user = appleUserFromFormField(formUserJson);
  if (!user) {
    return success;
  }
  return {
    ...success,
    providerUser: { ...success.providerUser, user },
  };
}

export function oauthStateFromThirdPartySignInUpInput(
  input: ThirdPartySignInUpInput,
): string | undefined {
  if (!("redirectURIInfo" in input) || input.redirectURIInfo == null) {
    return undefined;
  }
  const state = input.redirectURIInfo.redirectURIQueryParams?.state;
  return typeof state === "string" && state.length > 0 ? state : undefined;
}

export function appleFormUserJsonFromInput(
  input: ThirdPartySignInUpInput,
): string | undefined {
  if (!("redirectURIInfo" in input) || input.redirectURIInfo == null) {
    return undefined;
  }
  const user = input.redirectURIInfo.redirectURIQueryParams?.user;
  return typeof user === "string" ? user : undefined;
}

export function createAppleSignInSuccess(
  response: CreateAppleSignInResponse,
): AppleSignInSuccess | null {
  if (response.status !== "OK") return null;

  const payload = response.rawUserInfoFromProvider.fromIdTokenPayload ?? {};
  const fromApi = response.rawUserInfoFromProvider.fromUserInfoAPI ?? {};

  return {
    providerUser: {
      sub: typeof payload["sub"] === "string" ? payload["sub"] : undefined,
      email:
        typeof payload["email"] === "string" ? payload["email"] : undefined,
      name: typeof payload["name"] === "string" ? payload["name"] : undefined,
      user: appleUserFromPayload(payload) ?? appleUserFromPayload(fromApi),
    },
    oAuthTokens: response.oAuthTokens,
    createdNewRecipeUser: response.createdNewRecipeUser,
    recipeUserId: response.session?.getUserId() ?? response.user.id,
    loginMethodsLength: response.user.loginMethods.length,
  };
}

export async function maybeReplaceEmailPasswordSession(
  input: EmailPasswordAuthInput,
  response: EmailPasswordAuthResponse,
  compassUserId: string,
  replaceSession: (
    input: EmailPasswordAuthInput,
    currentSession: SessionContainerInterface,
    compassUserId: string,
  ) => Promise<SessionContainerInterface>,
): Promise<EmailPasswordAuthResponse> {
  if (response.session.getUserId() === compassUserId) {
    return response;
  }

  const session = await replaceSession(input, response.session, compassUserId);

  return { ...response, session };
}
