import { providerAvailability } from "@web/auth/providers/provider-availability.instance";

export const {
  useIsProviderAvailable,
  setProviderAvailabilityForTests,
  resetProviderAvailabilityForTests,
} = providerAvailability;
