import { providerAvailability } from "@web/auth/providers/provider-availability.instance";

export const {
  useIsProviderAvailable,
  useConnectableProviders,
  setProviderAvailabilityForTests,
  resetProviderAvailabilityForTests,
} = providerAvailability;
