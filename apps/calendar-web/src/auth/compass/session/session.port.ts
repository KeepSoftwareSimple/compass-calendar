import SuperTokensSession from "supertokens-web-js/recipe/session";

export type SessionApiPort = Pick<
  typeof SuperTokensSession,
  | "doesSessionExist"
  | "getUserId"
  | "signOut"
  | "getAccessToken"
  | "validateClaims"
  | "getClaimValue"
  | "PrimitiveClaim"
  | "BooleanClaim"
  | "PrimitiveArrayClaim"
  | "attemptRefreshingSession"
  | "getInvalidClaimsFromResponse"
  | "getAccessTokenPayloadSecurely"
>;

function createProductionSessionApiPort(): SessionApiPort {
  return SuperTokensSession as SessionApiPort;
}

let sessionApiPort: SessionApiPort = createProductionSessionApiPort();

export function getSessionApiPort(): SessionApiPort {
  return sessionApiPort;
}

export function registerSessionApiPort(port: SessionApiPort): void {
  sessionApiPort = port;
}

export function resetSessionApiPort(): void {
  sessionApiPort = createProductionSessionApiPort();
}
