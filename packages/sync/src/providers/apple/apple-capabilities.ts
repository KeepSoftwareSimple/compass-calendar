import { type ProviderCapability } from "@core/types/sync/identity.contracts";

export const APPLE_PROVIDER_CAPABILITIES: readonly ProviderCapability[] = [
  "readEvents",
  "writeEvents",
  "readBusy",
  "inviteAttendees",
  "incrementalChanges",
];

export function appleScopesForFeatures(
  _features: readonly string[],
): readonly string[] {
  return [];
}

export function appleCapabilitiesFromScopes(
  _scopes: readonly string[],
): ProviderCapability[] {
  return [...APPLE_PROVIDER_CAPABILITIES];
}
