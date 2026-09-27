import { type CaptureResult } from "posthog-js";
import { filterPosthogBookingTelemetry } from "@web/auth/posthog/posthog-booking-filter.util";
import { describe, expect, it } from "bun:test";

const SENTINEL = {
  name: "SENTINEL_GUEST_NAME",
  email: "sentinel.guest@example.test",
  notes: "SENTINEL_GUEST_NOTES",
  token: "sentinel-capability-token-9f3c",
  slug: "sentinel-host-slug",
  reservationId: "507f1f77bcf86cd799439011",
} as const;

const confirmedUrl = `https://app.compasscalendar.com/meet/confirmed/${SENTINEL.reservationId}?token=${SENTINEL.token}`;
const hostPageUrl = `https://app.compasscalendar.com/meet/${SENTINEL.slug}`;
const legacyUrl = `https://app.compasscalendar.com/book/${SENTINEL.slug}`;

const assertNoSentinels = (value: unknown) => {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(SENTINEL.name);
  expect(serialized).not.toContain(SENTINEL.email);
  expect(serialized).not.toContain(SENTINEL.notes);
  expect(serialized).not.toContain(SENTINEL.token);
  expect(serialized).not.toContain(SENTINEL.slug);
  expect(serialized).not.toContain(SENTINEL.reservationId);
};

const capture = (
  event: string,
  properties: CaptureResult["properties"],
): CaptureResult =>
  ({
    uuid: "test-uuid",
    event,
    properties,
  }) as CaptureResult;

describe("filterPosthogBookingTelemetry", () => {
  it("sanitizes pageviews for direct landing, SPA navigation, and legacy /book", () => {
    for (const url of [hostPageUrl, confirmedUrl, legacyUrl]) {
      const result = filterPosthogBookingTelemetry(
        capture("$pageview", {
          $current_url: url,
          $pathname: new URL(url).pathname,
          $referrer: confirmedUrl,
        }),
      );
      expect(result).not.toBeNull();
      expect(result?.event).toBe("$pageview");
      assertNoSentinels(result);
      expect(result?.properties?.booking_route).toMatch(/^meet_|^book_/);
    }
  });

  it("keeps named booking events and strips guest fields", () => {
    for (const event of [
      "booking_reservation_created",
      "booking_slots_loaded",
      "booking_submit_failed",
    ]) {
      const result = filterPosthogBookingTelemetry(
        capture(event, {
          $current_url: confirmedUrl,
          duration_minutes: 30,
          outcome: "available",
          reason: "validation",
          guestName: SENTINEL.name,
          guestEmail: SENTINEL.email,
          notes: SENTINEL.notes,
          reservationId: SENTINEL.reservationId,
          token: SENTINEL.token,
        }),
      );

      expect(result?.properties?.duration_minutes).toBe(30);
      expect(result?.properties?.booking_route).toBe("meet_confirmed");
      assertNoSentinels(result);
    }
  });

  it("drops replay, autocapture, and exceptions on public booking pages", () => {
    for (const event of [
      "$snapshot",
      "$autocapture",
      "$rageclick",
      "$dead_click",
      "$exception",
    ]) {
      expect(
        filterPosthogBookingTelemetry(
          capture(event, {
            $current_url: confirmedUrl,
            $el_text: SENTINEL.name,
            $exception_values: [SENTINEL.email],
          }),
        ),
      ).toBeNull();
    }
  });

  it("leaves authenticated calendar pageviews intact", () => {
    const event = capture("$pageview", {
      $current_url: "https://app.compasscalendar.com/week/2026-09-13",
      $pathname: "/week/2026-09-13",
      email: "host@example.test",
    });
    const result = filterPosthogBookingTelemetry(event);
    expect(result?.properties?.$current_url).toBe(
      "https://app.compasscalendar.com/week/2026-09-13",
    );
    expect(result?.properties?.email).toBe("host@example.test");
    expect(result?.properties?.booking_route).toBeUndefined();
  });

  it("redacts a calendar pageview whose referrer still carries a capability URL", () => {
    const result = filterPosthogBookingTelemetry(
      capture("$pageview", {
        $current_url: "https://app.compasscalendar.com/week/2026-09-13",
        $pathname: "/week/2026-09-13",
        $referrer: confirmedUrl,
      }),
    );
    expect(result?.properties?.$referrer).toBe(
      "https://app.compasscalendar.com/meet/confirmed/:reservationId",
    );
    assertNoSentinels(result);
  });
});
