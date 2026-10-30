import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import {
  shouldRegisterSyntheticAccount,
  syntheticAccountPosthogRegistration,
} from "@web/auth/posthog/posthog-audience-filter.util";
import {
  type SignupMethod,
  trackSignupCompleted,
} from "@web/auth/posthog/signup-funnel";

const STORAGE_PREFIX = "compass:signup_completed:";

let pendingMethod: SignupMethod | null = null;

/** Queue signup completion until the signed-in profile is loaded and identified. */
export function scheduleSignupCompleted(method: SignupMethod): void {
  pendingMethod = method;
}

export function resetSignupCompletedCoordinatorForTests(): void {
  pendingMethod = null;
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
  const method = pendingMethod;
  if (!method) return;

  if (hasAlreadyEmittedSignupCompleted(input.userId)) {
    pendingMethod = null;
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
  pendingMethod = null;
}
