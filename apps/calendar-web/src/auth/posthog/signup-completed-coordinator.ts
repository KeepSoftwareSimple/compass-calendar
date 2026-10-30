import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import {
  shouldRegisterSyntheticAccount,
  syntheticAccountPosthogRegistration,
} from "@web/auth/posthog/posthog-audience-filter.util";
import {
  isSignupMethod,
  type SignupMethod,
  trackSignupCompleted,
} from "@web/auth/posthog/signup-funnel";

const STORAGE_PREFIX = "compass:signup_completed:";
const PENDING_SIGNUP_METHOD_KEY = "compass:pending_signup_method";

export const SIGNUP_COMPLETED_FLUSH_REQUEST_EVENT =
  "compass:signup-completed-flush-request";

let pendingMethod: SignupMethod | null = null;

function persistPendingMethod(method: SignupMethod): void {
  pendingMethod = method;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_SIGNUP_METHOD_KEY, method);
  } catch {
    // In-memory pending still works for the current navigation.
  }
}

function readPendingMethod(): SignupMethod | null {
  if (pendingMethod) return pendingMethod;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(PENDING_SIGNUP_METHOD_KEY);
    if (isSignupMethod(stored)) return stored;
  } catch {
    return null;
  }
  return null;
}

function clearPendingMethod(): void {
  pendingMethod = null;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_METHOD_KEY);
  } catch {
    // Best effort.
  }
}

function requestSignupCompletedFlush(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SIGNUP_COMPLETED_FLUSH_REQUEST_EVENT));
}

/** Queue signup completion until the signed-in profile is loaded and identified. */
export function scheduleSignupCompleted(method: SignupMethod): void {
  persistPendingMethod(method);
  requestSignupCompletedFlush();
}

export function resetSignupCompletedCoordinatorForTests(): void {
  clearPendingMethod();
}

function signupCompletedStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function hasAlreadyEmittedSignupCompleted(userId: string): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    return sessionStorage.getItem(signupCompletedStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

function markSignupCompletedEmitted(userId: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(signupCompletedStorageKey(userId), "1");
  } catch {
    // Best effort only; in-memory pending state still prevents double capture.
  }
}

/**
 * Fires `signup_completed` once per account after PostHog identify, with
 * synthetic/test super properties when the inbox matches journey rules.
 */
export function flushSignupCompletedAfterSessionReady(input: {
  userId: string;
  profileEmail: string;
  isSynthetic?: boolean | null;
}): void {
  const method = readPendingMethod();
  if (!method) return;

  if (hasAlreadyEmittedSignupCompleted(input.userId)) {
    clearPendingMethod();
    return;
  }

  const posthog = getPosthogClient();
  const isSyntheticAccount = shouldRegisterSyntheticAccount({
    email: input.profileEmail,
    isSynthetic: input.isSynthetic,
  });
  if (isSyntheticAccount && posthog?.register) {
    posthog.register(syntheticAccountPosthogRegistration());
  }

  const syntheticProperties = isSyntheticAccount
    ? syntheticAccountPosthogRegistration()
    : undefined;

  trackSignupCompleted(method, syntheticProperties);
  markSignupCompletedEmitted(input.userId);
  clearPendingMethod();
}
