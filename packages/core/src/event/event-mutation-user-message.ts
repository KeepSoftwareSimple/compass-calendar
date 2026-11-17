import { type ProviderKind } from "@core/types/sync/identity.contracts";

/** User-facing calendar product names for provider save failures. */
const PROVIDER_CALENDAR_PRODUCT_NAME: Record<ProviderKind, string> = {
  google: "Google Calendar",
  microsoft: "Microsoft Calendar",
  apple: "Apple Calendar",
};

/** Short provider name for in-flight save copy (Outlook, not Microsoft Calendar). */
const PROVIDER_SAVE_BRAND_NAME: Record<ProviderKind, string> = {
  google: "Google Calendar",
  microsoft: "Outlook",
  apple: "Apple Calendar",
};

export function providerCalendarProductName(provider: ProviderKind): string {
  return PROVIDER_CALENDAR_PRODUCT_NAME[provider];
}

export function providerSaveBrandName(
  provider: ProviderKind | undefined,
): string | undefined {
  return provider ? PROVIDER_SAVE_BRAND_NAME[provider] : undefined;
}

/**
 * Non-technical copy when a create/replace/delete could not reach the user's
 * calendar provider. When the provider is unknown, fall back to neutral wording.
 */
export function providerSaveFailureMessage(
  provider: ProviderKind | undefined,
): string {
  if (provider) {
    return `Couldn't save to ${providerCalendarProductName(provider)}. Your change wasn't saved.`;
  }
  return "Couldn't save that change, the calendar service had a problem. Your edit was not applied.";
}

/** When Google returns a generic badRequest for an otherwise valid edit. */
export function googleProviderRejectedChangeMessage(): string {
  return "Google rejected this change. Your edit wasn't saved. Try again.";
}

/**
 * When Sync accepted the write but the HTTP request outran the provider, the
 * command stays pending and Compass retries it. The edit may still land.
 */
export function syncUnavailablePendingMessage(
  provider: ProviderKind | undefined,
): string {
  const brand = providerSaveBrandName(provider);
  if (brand === "Outlook") {
    return "Still saving to Outlook. Microsoft is responding slowly, so your change may appear shortly. Compass will keep trying.";
  }
  if (brand) {
    return `Still saving to ${brand}. Your change may appear shortly. Compass will keep trying.`;
  }
  return "Still saving your change. The calendar service is slow to respond, so it may appear shortly. Compass will keep trying.";
}
