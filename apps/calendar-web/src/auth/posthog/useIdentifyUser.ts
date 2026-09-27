import { useEffect } from "react";
import { isPublicBookingPath } from "@core/booking/booking-telemetry";
import { usePostHog } from "@web/auth/posthog/posthog-react";

/**
 * Identifies the signed-in Compass user in PostHog. Guest booking
 * identity (email on the public form, reservation id, capability token)
 * never goes through identify or alias; public /meet and /book routes
 * skip this even if a host session is sitting in another tab's storage.
 */
export function useIdentifyUser(
  profileEmail: string | null,
  userId: string | null,
): void {
  const posthog = usePostHog();
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      isPublicBookingPath(window.location.pathname)
    ) {
      return;
    }
    if (
      userId &&
      profileEmail &&
      posthog &&
      typeof posthog.identify === "function"
    ) {
      posthog.identify(userId, { email: profileEmail, user_id: userId });
    }
  }, [profileEmail, posthog, userId]);
}
