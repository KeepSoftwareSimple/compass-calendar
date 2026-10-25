import { type VerifySessionOptions } from "supertokens-node/lib/build/recipe/session/types";
import { verifySession as supertokensVerifySession } from "supertokens-node/recipe/session/framework/express";

type VerifySessionMiddlewareFactory = typeof supertokensVerifySession;

let verifySessionFactory: VerifySessionMiddlewareFactory =
  supertokensVerifySession;

/** Production session guard; tests replace via registerTestVerifySession. */
export function verifySession(options?: VerifySessionOptions) {
  return verifySessionFactory(options);
}

export function registerTestVerifySession(
  factory: VerifySessionMiddlewareFactory,
): void {
  verifySessionFactory = factory;
}

export function resetVerifySession(): void {
  verifySessionFactory = supertokensVerifySession;
}
