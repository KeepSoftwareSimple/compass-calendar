import supertokens from "supertokens-node";
import Session from "supertokens-node/recipe/session";
import { type SessionContainerInterface } from "supertokens-node/recipe/session/types";
import { type RecipeInterface as ThirdPartyRecipeInterface } from "supertokens-node/recipe/thirdparty/types";
import { NodeEnv } from "@core/constants/core.constants";
import { Logger } from "@core/logger/winston.logger";
import { providerKindFromThirdPartyId } from "@core/types/sync/identity.contracts";
import { emailForVerifiedAccountLinkLookup } from "@backend/auth/services/account-linking.util";
import {
  appleAuthService,
  appleEmail,
  appleSubjectId,
} from "@backend/auth/services/apple/apple.auth.service";
import { type AppleSignInSuccess } from "@backend/auth/services/apple/apple.auth.types";
import { googleAuthService } from "@backend/auth/services/google/google.auth.service";
import { type GoogleSignInSuccess } from "@backend/auth/services/google/google.auth.types";
import {
  microsoftAuthService,
  microsoftEmail,
  microsoftSubjectId,
} from "@backend/auth/services/microsoft/microsoft.auth.service";
import { type MicrosoftSignInSuccess } from "@backend/auth/services/microsoft/microsoft.auth.types";
import { CONFIG } from "@backend/common/constants/config.constants";
import {
  appleFormUserJsonFromInput,
  buildResetPasswordLink,
  createAppleSignInSuccess,
  createGoogleSignInSuccess,
  createMicrosoftSignInSuccess,
  ensureExternalUserIdMapping,
  getFormFieldValue,
  maybeReplaceEmailPasswordSession,
  withAppleFirstAuthorizationName,
} from "@backend/common/middleware/supertokens.middleware.util";
import userService from "@backend/user/services/user.service";
import {
  type CreateAppleSignInResponse,
  type CreateGoogleSignInResponse,
  type CreateMicrosoftSignInResponse,
  type CreateNewRecipeUserFn,
  type CreateThirdPartyUserFn,
  type SignInPOSTFn,
  type SignUpPOSTFn,
  type ThirdPartySignInUpInput,
  type ThirdPartySignInUpPostFn,
} from "./supertokens.middleware.types";

const logger = Logger("app:supertokens.middleware");

async function replaceSessionWithCompassUser(
  input: { options: { req: unknown; res: unknown } },
  currentSession: SessionContainerInterface,
  compassUserId: string,
) {
  const compassSession = await Session.createNewSession(
    input.options.req,
    input.options.res,
    "public",
    supertokens.convertToRecipeUserId(compassUserId),
  );

  await Session.revokeSession(currentSession.getHandle());

  return compassSession;
}

// If this Google account already maps to a Compass user, swap the temporary SuperTokens session for theirs and remap `success` (recipeUserId).
async function maybeRemapGoogleSignInToCompassSession(
  input: ThirdPartySignInUpInput,
  response: Awaited<ReturnType<ThirdPartySignInUpPostFn>>,
  success: GoogleSignInSuccess,
): Promise<{
  response: Awaited<ReturnType<ThirdPartySignInUpPostFn>>;
  success: GoogleSignInSuccess;
}> {
  const connectedCompassUserId = await userService.getCanonicalCompassUserId({
    provider: "google",
    subjectId: success.providerUser.sub,
    email: success.providerUser.email,
  });

  if (
    input.session ||
    !connectedCompassUserId ||
    response.status !== "OK" ||
    response.session.getUserId() === connectedCompassUserId
  ) {
    return { response, success };
  }

  const session = await replaceSessionWithCompassUser(
    input,
    response.session,
    connectedCompassUserId,
  );

  const responseWithCompassSession = { ...response, session };
  const successAfterSessionRemap = createGoogleSignInSuccess(
    responseWithCompassSession as CreateGoogleSignInResponse,
  );
  if (!successAfterSessionRemap) {
    throw new Error(
      "Missing Google sign-in success after Compass session replacement",
    );
  }

  return {
    response: responseWithCompassSession,
    success: successAfterSessionRemap,
  };
}

async function maybeRemapMicrosoftSignInToCompassSession(
  input: ThirdPartySignInUpInput,
  response: Awaited<ReturnType<ThirdPartySignInUpPostFn>>,
  success: MicrosoftSignInSuccess,
): Promise<{
  response: Awaited<ReturnType<ThirdPartySignInUpPostFn>>;
  success: MicrosoftSignInSuccess;
}> {
  const connectedCompassUserId = await userService.getCanonicalCompassUserId({
    provider: "microsoft",
    subjectId: microsoftSubjectId(success.providerUser),
    email: emailForVerifiedAccountLinkLookup(
      microsoftEmail(success.providerUser),
    ),
  });

  if (
    input.session ||
    !connectedCompassUserId ||
    response.status !== "OK" ||
    response.session.getUserId() === connectedCompassUserId
  ) {
    return { response, success };
  }

  const session = await replaceSessionWithCompassUser(
    input,
    response.session,
    connectedCompassUserId,
  );

  const responseWithCompassSession = { ...response, session };
  const successAfterSessionRemap = createMicrosoftSignInSuccess(
    responseWithCompassSession as CreateMicrosoftSignInResponse,
  );
  if (!successAfterSessionRemap) {
    throw new Error(
      "Missing Microsoft sign-in success after Compass session replacement",
    );
  }

  return {
    response: responseWithCompassSession,
    success: successAfterSessionRemap,
  };
}

async function maybeRemapAppleSignInToCompassSession(
  input: ThirdPartySignInUpInput,
  response: Awaited<ReturnType<ThirdPartySignInUpPostFn>>,
  success: AppleSignInSuccess,
): Promise<{
  response: Awaited<ReturnType<ThirdPartySignInUpPostFn>>;
  success: AppleSignInSuccess;
}> {
  const connectedCompassUserId = await userService.getCanonicalCompassUserId({
    provider: "apple",
    subjectId: appleSubjectId(success.providerUser),
    email: emailForVerifiedAccountLinkLookup(appleEmail(success.providerUser)),
  });

  if (
    input.session ||
    !connectedCompassUserId ||
    response.status !== "OK" ||
    response.session.getUserId() === connectedCompassUserId
  ) {
    return { response, success };
  }

  const session = await replaceSessionWithCompassUser(
    input,
    response.session,
    connectedCompassUserId,
  );

  const responseWithCompassSession = { ...response, session };
  const successAfterSessionRemap = createAppleSignInSuccess(
    responseWithCompassSession as CreateAppleSignInResponse,
  );
  if (!successAfterSessionRemap) {
    throw new Error(
      "Missing Apple sign-in success after Compass session replacement",
    );
  }

  return {
    response: responseWithCompassSession,
    success: successAfterSessionRemap,
  };
}

export async function createThirdPartyUser(
  input: Parameters<CreateThirdPartyUserFn>[0],
  originalCreateThirdPartyUser: CreateThirdPartyUserFn,
): Promise<
  Awaited<ReturnType<ThirdPartyRecipeInterface["manuallyCreateOrUpdateUser"]>>
> {
  const response = await originalCreateThirdPartyUser(input);

  if (response.status !== "OK") {
    return response;
  }

  await ensureExternalUserIdMapping(response.recipeUserId.getAsString());

  return response;
}

export async function handleThirdPartySignInUp(
  input: ThirdPartySignInUpInput,
  originalSignInUpPOST: ThirdPartySignInUpPostFn,
): Promise<Awaited<ReturnType<ThirdPartySignInUpPostFn>>> {
  const thirdPartyId = input.provider?.id ?? "google";
  const kind = providerKindFromThirdPartyId(thirdPartyId);

  let response: Awaited<ReturnType<ThirdPartySignInUpPostFn>>;

  try {
    response = await originalSignInUpPOST(input);
  } catch (err) {
    logger.error("oauth_callback_returned: token exchange threw", {
      provider: kind,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (response.status !== "OK") {
    logger.warn("oauth_callback_returned: sign-in status not OK", {
      provider: kind,
      status: response.status,
    });
  }

  try {
    if (kind === "microsoft") {
      const success = createMicrosoftSignInSuccess(
        response as CreateMicrosoftSignInResponse,
      );
      if (!success) {
        return response;
      }
      const remapped = await maybeRemapMicrosoftSignInToCompassSession(
        input,
        response,
        success,
      );
      await microsoftAuthService.handleMicrosoftAuth(remapped.success, {
        hasExistingSession: Boolean(input.session),
      });
      return remapped.response;
    }

    if (kind === "apple") {
      const success = createAppleSignInSuccess(
        response as CreateAppleSignInResponse,
      );
      if (!success) {
        return response;
      }
      const remapped = await maybeRemapAppleSignInToCompassSession(
        input,
        response,
        success,
      );
      await appleAuthService.handleAppleAuth(
        withAppleFirstAuthorizationName(
          remapped.success,
          appleFormUserJsonFromInput(input),
        ),
        {
          hasExistingSession: Boolean(input.session),
        },
      );
      return remapped.response;
    }

    const success = createGoogleSignInSuccess(
      response as CreateGoogleSignInResponse,
    );

    if (!success) {
      return response;
    }

    const remapped = await maybeRemapGoogleSignInToCompassSession(
      input,
      response,
      success,
    );

    await googleAuthService.handleGoogleAuth(remapped.success, {
      hasExistingSession: Boolean(input.session),
    });

    return remapped.response;
  } catch (err) {
    logger.error("oauth_callback_returned: post-exchange handling threw", {
      provider: kind,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function sendPasswordResetEmail<
  T extends { passwordResetLink: string; user: { email: string } },
>(input: T, originalSendEmail: (input: T) => Promise<void>): Promise<void> {
  const resetLink = buildResetPasswordLink(
    input.passwordResetLink,
    CONFIG.FRONTEND_URL,
  );

  if (CONFIG.NODE_ENV === NodeEnv.Test) {
    logger.info(`Password reset link for ${input.user.email}: ${resetLink}`);
    return;
  }

  await originalSendEmail({ ...input, passwordResetLink: resetLink });
}

export async function createEmailPasswordUser(
  input: Parameters<CreateNewRecipeUserFn>[0],
  originalCreateNewRecipeUser: CreateNewRecipeUserFn,
): Promise<Awaited<ReturnType<CreateNewRecipeUserFn>>> {
  const response = await originalCreateNewRecipeUser(input);

  if (response.status !== "OK") {
    return response;
  }

  await ensureExternalUserIdMapping(response.recipeUserId.getAsString());

  return response;
}

export async function handleEmailPasswordSignUp(
  input: Parameters<SignUpPOSTFn>[0],
  originalSignUpPOST: SignUpPOSTFn,
): Promise<Awaited<ReturnType<SignUpPOSTFn>>> {
  const response = await originalSignUpPOST(input);

  if (response.status === "OK") {
    const email = getFormFieldValue(input.formFields, "email");
    const name = getFormFieldValue(input.formFields, "name");
    const userId = response.session.getUserId();

    if (email) {
      const { user } = await userService.upsertUserFromAuth({
        userId,
        email,
        name,
      });
      const remappedResponse = await maybeReplaceEmailPasswordSession(
        input,
        response,
        user.userId,
        replaceSessionWithCompassUser,
      );
      return remappedResponse;
    }
  }

  return response;
}

export async function handleEmailPasswordSignIn(
  input: Parameters<SignInPOSTFn>[0],
  originalSignInPOST: SignInPOSTFn,
): Promise<Awaited<ReturnType<SignInPOSTFn>>> {
  const response = await originalSignInPOST(input);

  if (response.status === "OK") {
    const email = getFormFieldValue(input.formFields, "email");
    const userId = response.session.getUserId();

    if (email) {
      const { user } = await userService.upsertUserFromAuth({ userId, email });
      return maybeReplaceEmailPasswordSession(
        input,
        response,
        user.userId,
        replaceSessionWithCompassUser,
      );
    }
  }

  return response;
}
