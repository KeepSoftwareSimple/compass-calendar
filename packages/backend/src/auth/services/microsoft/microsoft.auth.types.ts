export type { AuthDecision } from "@backend/auth/services/google/google.auth.types";

export type MicrosoftIdTokenPayload = {
  oid?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
};

export type MicrosoftSignInSuccess = {
  providerUser: MicrosoftIdTokenPayload;
  oAuthTokens: {
    refresh_token?: string;
    access_token?: string;
    scope?: string;
  };
  createdNewRecipeUser: boolean;
  recipeUserId: string;
  loginMethodsLength: number;
};
