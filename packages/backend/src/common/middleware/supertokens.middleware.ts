import cors from "cors";
import SuperTokens from "supertokens-node";
import Dashboard from "supertokens-node/recipe/dashboard";
import EmailPassword from "supertokens-node/recipe/emailpassword";
import Session from "supertokens-node/recipe/session";
import ThirdParty from "supertokens-node/recipe/thirdparty";
import {
  type ProviderInput,
  type TypeInput as ThirdPartyTypeInput,
} from "supertokens-node/recipe/thirdparty/types";
import UserMetadata from "supertokens-node/recipe/usermetadata";
import { APP_NAME } from "@core/constants/core.constants";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import { GOOGLE_AUTH_SCOPES_REQUESTED } from "@backend/auth/services/google/google.auth.scopes";
import { CONFIG } from "@backend/common/constants/config.constants";
import {
  isAppleSignInConfigured,
  isGoogleConfigured,
  isMicrosoftConfigured,
} from "@backend/common/constants/config.util";
import {
  createEmailPasswordUser,
  createThirdPartyUser,
  handleEmailPasswordSignIn,
  handleEmailPasswordSignUp,
  handleThirdPartySignInUp,
  sendPasswordResetEmail,
} from "@backend/common/middleware/supertokens.middleware.handlers";

const createGoogleProvider = (
  clientId: string,
  clientSecret: string,
): ProviderInput => ({
  config: {
    thirdPartyId: "google",
    clients: [
      {
        clientType: "web",
        clientId,
        clientSecret,
        // Contacts are authorized only when the user explicitly enables that
        // feature through the Sync connection flow.
        scope: GOOGLE_AUTH_SCOPES_REQUESTED,
      },
    ],
  },
});

const createMicrosoftProvider = (
  clientId: string,
  clientSecret: string,
): ProviderInput => ({
  config: {
    thirdPartyId: "active-directory",
    clients: [
      {
        clientType: "web",
        clientId,
        clientSecret,
        scope: [...MICROSOFT_SCOPES],
        additionalConfig: {
          directoryId: "common",
        },
      },
    ],
  },
});

const createAppleProvider = (
  clientId: string,
  keyId: string,
  teamId: string,
  privateKey: string,
): ProviderInput => ({
  config: {
    thirdPartyId: "apple",
    clients: [
      {
        clientType: "web",
        clientId,
        scope: ["openid", "email", "name"],
        additionalConfig: {
          keyId,
          teamId,
          privateKey,
        },
      },
    ],
  },
});

const thirdPartyOverride: NonNullable<ThirdPartyTypeInput["override"]> = {
  functions(originalImplementation) {
    return {
      ...originalImplementation,
      async manuallyCreateOrUpdateUser(input) {
        return createThirdPartyUser(
          input,
          originalImplementation.manuallyCreateOrUpdateUser.bind(
            originalImplementation,
          ),
        );
      },
    };
  },
  apis(originalImplementation) {
    return {
      ...originalImplementation,
      async signInUpPOST(input) {
        // Keep this at the API layer: Compass may need to replace the session
        // SuperTokens creates before Google sync/auth work runs.
        const signInUpPOST = originalImplementation.signInUpPOST;

        if (!signInUpPOST) {
          throw new BaseError(
            "signInUpPOST not implemented",
            "signInUpPOST not implemented",
            Status.BAD_REQUEST,
            true,
          );
        }

        return handleThirdPartySignInUp(
          input,
          signInUpPOST.bind(originalImplementation),
        );
      },
    };
  },
};

const getThirdPartyRecipes = (): ReturnType<typeof ThirdParty.init>[] => {
  const providers: ProviderInput[] = [];

  const googleClientId = CONFIG.GOOGLE_CLIENT_ID;
  const googleClientSecret = CONFIG.GOOGLE_CLIENT_SECRET;
  if (googleClientId && googleClientSecret && isGoogleConfigured(CONFIG)) {
    providers.push(createGoogleProvider(googleClientId, googleClientSecret));
  }

  const microsoftClientId = CONFIG.MICROSOFT_CLIENT_ID;
  const microsoftClientSecret = CONFIG.MICROSOFT_CLIENT_SECRET;
  if (
    microsoftClientId &&
    microsoftClientSecret &&
    isMicrosoftConfigured(CONFIG)
  ) {
    providers.push(
      createMicrosoftProvider(microsoftClientId, microsoftClientSecret),
    );
  }

  const appleClientId = CONFIG.APPLE_SIGNIN_SERVICES_ID;
  const appleKeyId = CONFIG.APPLE_SIGNIN_KEY_ID;
  const appleTeamId = CONFIG.APPLE_SIGNIN_TEAM_ID;
  const applePrivateKey = CONFIG.APPLE_SIGNIN_PRIVATE_KEY;
  if (
    appleClientId &&
    appleKeyId &&
    appleTeamId &&
    applePrivateKey &&
    isAppleSignInConfigured(CONFIG)
  ) {
    providers.push(
      createAppleProvider(
        appleClientId,
        appleKeyId,
        appleTeamId,
        applePrivateKey,
      ),
    );
  }

  if (providers.length === 0) {
    return [];
  }

  return [
    ThirdParty.init({
      signInAndUpFeature: { providers },
      override: thirdPartyOverride,
    }),
  ];
};

const getSupertokensApiDomain = () => new URL(CONFIG.BASEURL).origin;

const getSupertokensWebsiteDomain = () => new URL(CONFIG.FRONTEND_URL).origin;

const getSupertokensAllowedOrigins = () =>
  CONFIG.ORIGINS_ALLOWED.length > 0
    ? CONFIG.ORIGINS_ALLOWED
    : [getSupertokensWebsiteDomain()];

export const initSupertokens = () => {
  SuperTokens.init({
    appInfo: {
      appName: APP_NAME,
      apiBasePath: "/api",
      apiDomain: getSupertokensApiDomain(),
      // Auth is modal-only on the web (`?auth=` param); there is no /login
      // route. Any SuperTokens-generated website link must land on a real
      // route, and /day preserves search params through its redirect.
      websiteBasePath: "/day",
      websiteDomain: getSupertokensWebsiteDomain(),
    },
    supertokens: {
      connectionURI: CONFIG.SUPERTOKENS_URI,
      apiKey: CONFIG.SUPERTOKENS_KEY,
    },
    framework: "express",
    recipeList: [
      // see added endpoints
      // https://app.swaggerhub.com/apis/supertokens/FDI/3.0.0
      // https://supertokens.com/docs/references/fdi/introduction
      // SuperTokens Cloud does not include the account-linking feature.
      // createPrimaryUser returns 402 and breaks every sign-in-up, so
      // automatic linking must stay off. Compass links same-email logins
      // itself in userService.getCanonicalCompassUserId. The SDK
      // auto-registers the accountlinking recipe with linking disabled
      // when it is absent from recipeList.
      ...getThirdPartyRecipes(),
      EmailPassword.init({
        signUpFeature: {
          formFields: [
            {
              id: "name",
              validate: (value) => {
                if (typeof value !== "string" || !value.trim()) {
                  return Promise.resolve("Name is required");
                }
                return Promise.resolve(undefined);
              },
            },
          ],
        },
        emailDelivery: {
          override: (originalImplementation) => ({
            ...originalImplementation,
            sendEmail: (input) =>
              sendPasswordResetEmail(input, (emailInput) =>
                originalImplementation.sendEmail(emailInput),
              ),
          }),
        },
        override: {
          functions(originalImplementation) {
            return {
              ...originalImplementation,
              async createNewRecipeUser(input) {
                return createEmailPasswordUser(input, (recipeInput) =>
                  originalImplementation.createNewRecipeUser(recipeInput),
                );
              },
            };
          },
          apis(originalImplementation) {
            return {
              ...originalImplementation,
              async signUpPOST(input) {
                const signUpPOST = originalImplementation.signUpPOST;

                if (!signUpPOST) {
                  throw new BaseError(
                    "signUpPOST not implemented",
                    "signUpPOST not implemented",
                    Status.BAD_REQUEST,
                    true,
                  );
                }

                return handleEmailPasswordSignUp(
                  input,
                  signUpPOST.bind(originalImplementation),
                );
              },
              async signInPOST(input) {
                const signInPOST = originalImplementation.signInPOST;

                if (!signInPOST) {
                  throw new BaseError(
                    "signInPOST not implemented",
                    "signInPOST not implemented",
                    Status.BAD_REQUEST,
                    true,
                  );
                }

                return handleEmailPasswordSignIn(
                  input,
                  signInPOST.bind(originalImplementation),
                );
              },
            };
          },
        },
      }),
      Dashboard.init(),
      // No Session override: signout needs no Compass-side cleanup since the
      // legacy sync-metadata restart flags were retired with user.google.
      Session.init(),
      UserMetadata.init(),
    ],
  });
};

export const supertokensCors = () =>
  cors({
    origin: getSupertokensAllowedOrigins(),
    allowedHeaders: [
      "content-type",
      "st-auth-mode",
      ...SuperTokens.getAllCORSHeaders(),
    ],
    credentials: true,
  });
