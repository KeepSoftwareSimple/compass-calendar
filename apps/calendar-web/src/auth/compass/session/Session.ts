import { type Event } from "supertokens-website/lib/build/types";
import {
  getSessionApiPort,
  type SessionApiPort,
} from "@web/auth/compass/session/session.port";

class Session {
  listeners = new Set<(event: Event) => void>();

  doesSessionExist: SessionApiPort["doesSessionExist"] = (...args) =>
    getSessionApiPort().doesSessionExist(...args);
  getUserId: SessionApiPort["getUserId"] = (...args) =>
    getSessionApiPort().getUserId(...args);
  signOut: SessionApiPort["signOut"] = (...args) =>
    getSessionApiPort().signOut(...args);
  getAccessToken: SessionApiPort["getAccessToken"] = (...args) =>
    getSessionApiPort().getAccessToken(...args);
  validateClaims: SessionApiPort["validateClaims"] = (...args) =>
    getSessionApiPort().validateClaims(...args);
  getClaimValue: SessionApiPort["getClaimValue"] = (...args) =>
    getSessionApiPort().getClaimValue(...args);
  attemptRefreshingSession: SessionApiPort["attemptRefreshingSession"] = (
    ...args
  ) => getSessionApiPort().attemptRefreshingSession(...args);
  getInvalidClaimsFromResponse: SessionApiPort["getInvalidClaimsFromResponse"] =
    (...args) => getSessionApiPort().getInvalidClaimsFromResponse(...args);
  getAccessTokenPayloadSecurely: SessionApiPort["getAccessTokenPayloadSecurely"] =
    (...args) => getSessionApiPort().getAccessTokenPayloadSecurely(...args);

  get PrimitiveClaim() {
    return getSessionApiPort().PrimitiveClaim;
  }
  get BooleanClaim() {
    return getSessionApiPort().BooleanClaim;
  }
  get PrimitiveArrayClaim() {
    return getSessionApiPort().PrimitiveArrayClaim;
  }

  /**
   * Subscribe to every emitted session event.
   * Returns an unsubscribe function.
   */
  onAnyEvent(listener: (event: Event) => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  emit(payload: Event) {
    for (const listener of this.listeners) listener(payload);
  }
}

export const session = new Session();
