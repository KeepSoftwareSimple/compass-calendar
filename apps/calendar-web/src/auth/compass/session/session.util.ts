import { session } from "@web/auth/compass/session/Session";

export const UNAUTHENTICATED_USER = "UNAUTHENTICATED_USER";

interface AccessTokenPayload {
  sub: string;
}

export const getUserId = async () => {
  const sessionExists = await session.doesSessionExist();

  if (!sessionExists) {
    return UNAUTHENTICATED_USER;
  }

  const accessTokenPayload =
    (await session.getAccessTokenPayloadSecurely()) as AccessTokenPayload;
  const userId = accessTokenPayload["sub"];
  return userId;
};
