import { type Credentials, type TokenPayload } from "google-auth-library";
import { zObjectId } from "@core/types/object-id.schema";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { StringV4Schema } from "@core/types/type.utils";
import { findCanonicalCompassUser } from "@backend/user/queries/user.queries";
import {
  type AuthDecision,
  type ParsedReconnectGoogleParams,
} from "../google.auth.types";

export async function determineThirdPartyAuthMode(
  provider: ProviderKind,
  subjectId: string,
  email: string | null | undefined,
  createdNewRecipeUser: boolean,
): Promise<AuthDecision> {
  const user = await findCanonicalCompassUser({
    provider,
    subjectId,
    email,
  });

  if (!user) {
    return {
      authMode: "SIGNUP",
      compassUserId: null,
      createdNewRecipeUser,
    };
  }

  return {
    authMode: "SIGNIN",
    compassUserId: user._id.toString(),
    createdNewRecipeUser,
  };
}

export async function determineGoogleAuthMode(
  googleUserId: string,
  email: string | null | undefined,
  createdNewRecipeUser: boolean,
): Promise<AuthDecision> {
  return determineThirdPartyAuthMode(
    "google",
    googleUserId,
    email,
    createdNewRecipeUser,
  );
}

export function parseReconnectGoogleParams(
  compassUserId: string,
  gUser: TokenPayload,
  oAuthTokens: Pick<Credentials, "refresh_token" | "access_token" | "scope">,
): ParsedReconnectGoogleParams {
  const cUserId = zObjectId.parse(compassUserId).toString();
  StringV4Schema.parse(gUser.sub);
  const refreshToken = StringV4Schema.parse(oAuthTokens.refresh_token);
  return { cUserId, gUser, refreshToken };
}
