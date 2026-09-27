import { z } from "zod/v4";
import { sessionBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  APPLE_AUTH_INTENT_MAX_AGE_MS,
  APPLE_AUTH_INTENT_STORAGE_PREFIX,
} from "./apple-authorization.constants";

export const AppleAuthorizationIntentSchema = z.object({
  intent: z.literal("signIn"),
  returnPath: z
    .string()
    .startsWith("/")
    .refine((path) => !path.startsWith("//")),
  createdAt: z.number(),
});

export type AppleAuthorizationIntent = z.infer<
  typeof AppleAuthorizationIntentSchema
>;

const getStorageKey = (state: string) =>
  `${APPLE_AUTH_INTENT_STORAGE_PREFIX}.${state}`;

export function writeAppleAuthorizationIntent(
  state: string,
  intent: AppleAuthorizationIntent,
): void {
  sessionBrowserStore.set(getStorageKey(state), JSON.stringify(intent));
}

export function readAppleAuthorizationIntent(
  state: string,
): AppleAuthorizationIntent | null {
  const key = getStorageKey(state);
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

  const parsed = AppleAuthorizationIntentSchema.safeParse(storedIntent);

  if (!parsed.success) {
    sessionBrowserStore.remove(key);
    return null;
  }

  const isExpired =
    Date.now() - parsed.data.createdAt > APPLE_AUTH_INTENT_MAX_AGE_MS;

  if (isExpired) {
    sessionBrowserStore.remove(key);
    return null;
  }

  return parsed.data;
}

export function clearAppleAuthorizationIntent(state: string): void {
  sessionBrowserStore.remove(getStorageKey(state));
}
