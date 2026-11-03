import { type Credentials, type TokenPayload } from "google-auth-library";
import {
  type APIInterface as EmailPasswordAPIInterface,
  type RecipeInterface as EmailPasswordRecipeInterface,
} from "supertokens-node/recipe/emailpassword/types";
import { type SessionContainerInterface } from "supertokens-node/recipe/session/types";
import {
  type APIInterface as ThirdPartyAPIInterface,
  type RecipeInterface as ThirdPartyRecipeInterface,
} from "supertokens-node/recipe/thirdparty/types";

export type ThirdPartySignInUpPostFn = NonNullable<
  ThirdPartyAPIInterface["signInUpPOST"]
>;
type ThirdPartySignInUpResponse = Awaited<ReturnType<ThirdPartySignInUpPostFn>>;
type ThirdPartySignInUpSuccess = Extract<
  ThirdPartySignInUpResponse,
  { status: "OK" }
>;
type GoogleThirdPartySignInUpSuccess = ThirdPartySignInUpSuccess & {
  rawUserInfoFromProvider: { fromIdTokenPayload: TokenPayload };
  oAuthTokens: Pick<Credentials, "refresh_token" | "access_token" | "scope">;
  user: { id: string; loginMethods: unknown[] };
  session?: SessionContainerInterface;
};

type MicrosoftThirdPartySignInUpSuccess = ThirdPartySignInUpSuccess & {
  rawUserInfoFromProvider: {
    fromIdTokenPayload?: Record<string, unknown>;
  };
  oAuthTokens: {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
  };
  user: { id: string; loginMethods: unknown[] };
  session?: SessionContainerInterface;
};

type AppleThirdPartySignInUpSuccess = ThirdPartySignInUpSuccess & {
  rawUserInfoFromProvider: {
    fromIdTokenPayload?: Record<string, unknown>;
    fromUserInfoAPI?: Record<string, unknown>;
  };
  oAuthTokens: {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
  };
  user: { id: string; loginMethods: unknown[] };
  session?: SessionContainerInterface;
};

export type ThirdPartySignInUpInput = Parameters<ThirdPartySignInUpPostFn>[0];
export type CreateGoogleSignInResponse =
  | { status: Exclude<ThirdPartySignInUpResponse["status"], "OK"> }
  | GoogleThirdPartySignInUpSuccess;
export type CreateMicrosoftSignInResponse =
  | { status: Exclude<ThirdPartySignInUpResponse["status"], "OK"> }
  | MicrosoftThirdPartySignInUpSuccess;
export type CreateAppleSignInResponse =
  | { status: Exclude<ThirdPartySignInUpResponse["status"], "OK"> }
  | AppleThirdPartySignInUpSuccess;
export type CreateThirdPartyUserFn =
  ThirdPartyRecipeInterface["manuallyCreateOrUpdateUser"];
export type AuthFormField = { id: string; value: unknown };

export type CreateNewRecipeUserFn =
  EmailPasswordRecipeInterface["createNewRecipeUser"];

export type SignUpPOSTFn = NonNullable<EmailPasswordAPIInterface["signUpPOST"]>;

export type SignInPOSTFn = NonNullable<EmailPasswordAPIInterface["signInPOST"]>;
export type EmailPasswordAuthInput =
  | Parameters<SignUpPOSTFn>[0]
  | Parameters<SignInPOSTFn>[0];
export type EmailPasswordAuthResponse = Extract<
  Awaited<ReturnType<SignUpPOSTFn>> | Awaited<ReturnType<SignInPOSTFn>>,
  { status: "OK" }
>;
