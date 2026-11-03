import { createExternalStore } from "@web/common/utils/external-store.util";

/**
 * Session boolean shared by SessionProvider and calendar reads.
 *
 * Route loaders learn that a session exists before React re-renders the
 * provider. Calendar fetches read this store at call time so an anonymous
 * observer cannot write the local sentinel back over a remote list.
 */
const authenticated = createExternalStore(false);

export function readAuthenticated(): boolean {
  return authenticated.get();
}

export function setAuthSessionAuthenticated(value: boolean): void {
  authenticated.set(value);
}

export function subscribeAuthenticated(onChange: () => void): () => void {
  return authenticated.subscribe(onChange);
}

/**
 * True once the first session check settles, either way. Until then a
 * missing session may still be loading; after it, a missing session is real.
 */
const sessionResolved = createExternalStore(false);

export function readSessionResolved(): boolean {
  return sessionResolved.get();
}

export function setSessionResolved(value: boolean): void {
  sessionResolved.set(value);
}

export function subscribeSessionResolved(onChange: () => void): () => void {
  return sessionResolved.subscribe(onChange);
}

export function resetAuthSessionStoreForTests(): void {
  authenticated.set(false);
  sessionResolved.set(false);
}
