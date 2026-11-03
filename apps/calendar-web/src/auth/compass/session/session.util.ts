import { session } from "@web/auth/compass/session/Session";

export const UNAUTHENTICATED_USER = "UNAUTHENTICATED_USER";

const DEFAULT_SESSION_WAIT_MS = 10_000;
const DEFAULT_SESSION_POLL_MS = 50;

/**
 * SuperTokens can return sign-up/sign-in success before `doesSessionExist`
 * reads true. Marking the app authenticated earlier races
 * `checkIfSessionExists`, which can leave billing on anonymous 401s.
 */
export async function waitForAuthSession(
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  // Playwright oauth specs mock `/api/signinup` but do not run a full
  // SuperTokens session handshake. SessionProvider already skips
  // `doesSessionExist` in this mode; waiting here only delays or breaks
  // `completeAuthentication` until timeout.
  if (typeof window !== "undefined" && window.__COMPASS_E2E_TEST__) {
    return true;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_SESSION_WAIT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_SESSION_POLL_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await session.doesSessionExist()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return false;
}

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
