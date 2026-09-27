import { z } from "zod/v4";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { sessionBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  GOOGLE_AUTH_INTENT_STORAGE_PREFIX,
  PROVIDER_AUTH_INTENT_MAX_AGE_MS,
  PROVIDER_AUTH_INTENT_STORAGE_PREFIX,
} from "./provider-authorization.constants";

export const ProviderAuthorizationIntentSchema = z.object({
  intent: z.literal("signIn"),
  returnPath: z
    .string()
    .startsWith("/")
    .refine((path) => !path.startsWith("//")),
  createdAt: z.number(),
});

export type ProviderAuthorizationIntent = z.infer<
  typeof ProviderAuthorizationIntentSchema
>;

const INTENT_STORAGE_PREFIX_BY_KIND: Record<ProviderKind, string> = {
  google: GOOGLE_AUTH_INTENT_STORAGE_PREFIX,
  microsoft: `${PROVIDER_AUTH_INTENT_STORAGE_PREFIX}.microsoft`,
  apple: `${PROVIDER_AUTH_INTENT_STORAGE_PREFIX}.apple`,
};

const getStorageKey = (provider: ProviderKind, state: string) =>
  `${INTENT_STORAGE_PREFIX_BY_KIND[provider]}.${state}`;

export function writeProviderAuthorizationIntent(
  provider: ProviderKind,
  state: string,
  intent: ProviderAuthorizationIntent,
): void {
  sessionBrowserStore.set(
    getStorageKey(provider, state),
    JSON.stringify(intent),
  );
}

export function readProviderAuthorizationIntent(
  provider: ProviderKind,
  state: string,
): ProviderAuthorizationIntent | null {
  const key = getStorageKey(provider, state);
  const stored = sessionBrowserStore.get(key);

  if (!stored) {
    return null;
  }

  let storedIntent: unknown;

  try {
    storedIntent = JSON.parse(stored);
  } catch {
    sessionBrowserStore.remove(key);
    return null;
  }

  const parsed = ProviderAuthorizationIntentSchema.safeParse(storedIntent);

  if (!parsed.success) {
    sessionBrowserStore.remove(key);
    return null;
  }

  const isExpired =
    Date.now() - parsed.data.createdAt > PROVIDER_AUTH_INTENT_MAX_AGE_MS;

  if (isExpired) {
    sessionBrowserStore.remove(key);
    return null;
  }

  return parsed.data;
}

export function clearProviderAuthorizationIntent(
  provider: ProviderKind,
  state: string,
): void {
  sessionBrowserStore.remove(getStorageKey(provider, state));
}

const googleNeedsConsentRetryKey = `${GOOGLE_AUTH_INTENT_STORAGE_PREFIX}.needsConsentRetry`;

export function markGoogleAuthNeedsConsentRetry(): void {
  sessionBrowserStore.set(googleNeedsConsentRetryKey, "1");
}

export function consumeGoogleAuthNeedsConsentRetry(): boolean {
  const needsRetry =
    sessionBrowserStore.get(googleNeedsConsentRetryKey) !== null;
  if (needsRetry) {
    sessionBrowserStore.remove(googleNeedsConsentRetryKey);
  }
  return needsRetry;
}
