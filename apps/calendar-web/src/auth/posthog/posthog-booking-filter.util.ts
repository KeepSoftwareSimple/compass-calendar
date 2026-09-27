import { type CaptureResult } from "posthog-js";
import {
  bookingRouteCategoryFromUrl,
  isPublicBookingPath,
  sanitizeBookingTelemetry,
} from "@core/booking/booking-telemetry";

/**
 * Capture names whose payloads cannot be rewritten into the booking
 * allowlist: replay blobs and DOM/network metadata, autocapture (form
 * text and tokenized hrefs), and exceptions (guest values in messages).
 * Named product events and sanitized pageviews stay.
 */
const UNSANITIZABLE_ON_PUBLIC_BOOKING = new Set([
  "$snapshot",
  "$snapshot_item",
  "$recording_blob",
  "$autocapture",
  "$rageclick",
  "$dead_click",
  "$dead_swipe",
  "$exception",
  "$heatmap",
]);

function isPublicBookingCapture(event: CaptureResult): boolean {
  const properties = event.properties;
  const pathname = properties?.$pathname;
  if (typeof pathname === "string" && pathname.length > 0) {
    return isPublicBookingPath(pathname);
  }
  const currentUrl = properties?.$current_url;
  if (typeof currentUrl === "string" && currentUrl.length > 0) {
    return isPublicBookingPath(currentUrl);
  }
  if (typeof window !== "undefined") {
    return isPublicBookingPath(window.location.href);
  }
  return false;
}

/**
 * Drop unsanitizable public-booking captures, then rewrite remaining
 * properties onto the route-category allowlist.
 */
export function filterPosthogBookingTelemetry(
  event: CaptureResult | null,
): CaptureResult | null {
  if (!event) return event;

  if (
    isPublicBookingCapture(event) &&
    UNSANITIZABLE_ON_PUBLIC_BOOKING.has(event.event)
  ) {
    return null;
  }

  const sanitized = sanitizeBookingTelemetry(event, {
    dropUnsafeKeys: isPublicBookingCapture(event),
  });
  const properties = sanitized.properties;
  if (properties) {
    const category = bookingRouteCategoryFromUrl(
      typeof properties.$current_url === "string"
        ? properties.$current_url
        : typeof properties.$pathname === "string"
          ? properties.$pathname
          : undefined,
    );
    if (category) {
      properties.booking_route = category;
    }
  }
  return sanitized;
}
