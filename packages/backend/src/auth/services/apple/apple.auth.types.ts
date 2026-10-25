export type { AuthDecision } from "@backend/auth/services/google/google.auth.types";

export type AppleIdTokenPayload = {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  user?: {
    name?: {
      firstName?: string;
      lastName?: string;
    };
  };
};

export type AppleSignInSuccess = {
  providerUser: AppleIdTokenPayload;
  oAuthTokens: {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
  };
  createdNewRecipeUser: boolean;
  recipeUserId: string;
  loginMethodsLength: number;
};
