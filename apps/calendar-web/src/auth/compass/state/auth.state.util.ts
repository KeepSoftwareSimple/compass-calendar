import { z } from "zod/v4";
import { clearAllGoogleReconnectRequired } from "@web/auth/providers/reconnect.state";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { subscribeToStorageKey } from "@web/common/utils/external-store.util";

export const AuthStateSchema = z.object({
  hasAuthenticated: z.boolean().default(false),
  lastKnownEmail: z.string().email().optional(),
  shouldPromptSignUpAfterAnonymousCalendarChange: z.boolean().default(false),
});

export type AuthState = z.infer<typeof AuthStateSchema>;

export const DEFAULT_AUTH_STATE: AuthState = AuthStateSchema.parse({});

const authStateListeners = new Set<() => void>();

function emitAuthStateChange(): void {
  authStateListeners.forEach((listener) => listener());
}

function normalizeStoredAuthState(parsed: unknown): AuthState {
  if (typeof parsed !== "object" || parsed === null) {
    return DEFAULT_AUTH_STATE;
  }

  const legacyState = parsed as {
    isGoogleAuthenticated?: unknown;
    hasAuthenticated?: unknown;
    lastKnownEmail?: unknown;
    shouldPromptSignUpAfterAnonymousCalendarChange?: unknown;
  };

  // Migrate legacy isGoogleAuthenticated to hasAuthenticated
  const hasAuthenticated =
    typeof legacyState.hasAuthenticated === "boolean"
      ? legacyState.hasAuthenticated
      : typeof legacyState.isGoogleAuthenticated === "boolean"
        ? legacyState.isGoogleAuthenticated
        : false;

  const migratedState = {
    hasAuthenticated,
    lastKnownEmail: legacyState.lastKnownEmail,
    shouldPromptSignUpAfterAnonymousCalendarChange:
      legacyState.shouldPromptSignUpAfterAnonymousCalendarChange,
  };

  const result = AuthStateSchema.safeParse(migratedState);
  return result.success ? result.data : DEFAULT_AUTH_STATE;
}

/**
 * Get the current authentication state from persistent browser storage.
 * Returns default state if not found or invalid.
 */
export function getAuthState(): AuthState {
  if (typeof window === "undefined") return DEFAULT_AUTH_STATE;

  const stored = persistentBrowserStore.get(STORAGE_KEYS.AUTH);
  if (!stored) return DEFAULT_AUTH_STATE;

  try {
    return normalizeStoredAuthState(JSON.parse(stored));
  } catch {
    return DEFAULT_AUTH_STATE;
  }
}

/**
 * Update authentication state in persistent browser storage.
 * Merges partial updates into existing state.
 */
export function updateAuthState(updates: Partial<AuthState>): void {
  if (typeof window === "undefined") return;

  const result = AuthStateSchema.safeParse({ ...getAuthState(), ...updates });
  if (!result.success) return;

  const wasStored = persistentBrowserStore.set(
    STORAGE_KEYS.AUTH,
    JSON.stringify(result.data),
  );
  if (wasStored) {
    emitAuthStateChange();
  }
}

/**
 * Marks that the user has authenticated at least once.
 * Once set, the app prefers RemoteEventRepository when the backend is available.
 * This prevents the UX issue where events disappear after login due to cleared IndexedDB.
 * Also clears any per-account reconnect-required overrides since the user is
 * re-authenticating.
 */
export function markUserAsAuthenticated(lastKnownEmail?: string): void {
  if (typeof window === "undefined") return;

  updateAuthState({
    hasAuthenticated: true,
    ...(lastKnownEmail ? { lastKnownEmail } : {}),
  });
  clearAllGoogleReconnectRequired();
}

/**
 * Checks if the user has ever authenticated.
 * Returns true if the user has logged in at least once.
 *
 * @returns true if user has previously authenticated
 */
export function hasUserEverAuthenticated(): boolean {
  return getAuthState().hasAuthenticated;
}

export function getLastKnownEmail(): string | undefined {
  return getAuthState().lastKnownEmail;
}

/**
 * Clears the authentication state.
 * WARNING: Only use this when user explicitly logs out and wants to clear all data.
 */
export function clearAuthenticationState(): void {
  if (typeof window === "undefined") return;

  if (persistentBrowserStore.remove(STORAGE_KEYS.AUTH)) {
    emitAuthStateChange();
  }
}

export function clearAnonymousCalendarChangeSignUpPrompt(): void {
  updateAuthState({ shouldPromptSignUpAfterAnonymousCalendarChange: false });
}

export function markAnonymousCalendarChangeForSignUpPrompt(): void {
  updateAuthState({ shouldPromptSignUpAfterAnonymousCalendarChange: true });
}

/**
 * True once an anonymous (never-authenticated) user has made a calendar
 * change, so the sidebar can prompt them to sign up before they lose it.
 */
export function shouldShowAnonymousCalendarChangeSignUpPrompt(): boolean {
  return getAuthState().shouldPromptSignUpAfterAnonymousCalendarChange === true;
}

export function subscribeToAuthState(listener: () => void): () => void {
  authStateListeners.add(listener);
  const unsubscribeStorage = subscribeToStorageKey(STORAGE_KEYS.AUTH, listener);

  return () => {
    authStateListeners.delete(listener);
    unsubscribeStorage();
  };
}
