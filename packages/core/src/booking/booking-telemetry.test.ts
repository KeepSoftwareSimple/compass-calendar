import {
  bookingRouteCategoryFromUrl,
  classifyBookingPath,
  isBookingCapabilityPath,
  isBookingUnsafeMetaKey,
  isPublicBookingPath,
  redactBookingSecretsFromString,
  redactBookingUrl,
  sanitizeBookingTelemetry,
} from "@core/booking/booking-telemetry";
import { describe, expect, it } from "bun:test";

const SENTINEL = {
  name: "SENTINEL_GUEST_NAME",
  email: "sentinel.guest@example.test",
  notes: "SENTINEL_GUEST_NOTES",
  token: "sentinel-capability-token-9f3c",
  slug: "sentinel-host-slug",
  reservationId: "507f1f77bcf86cd799439011",
} as const;

const confirmedUrl = `https://compasscalendar.com/meet/confirmed/${SENTINEL.reservationId}?token=${SENTINEL.token}`;
const hostPageUrl = `https://compasscalendar.com/meet/${SENTINEL.slug}`;
const legacyCancelUrl = `https://compasscalendar.com/book/cancel/${SENTINEL.reservationId}?token=${SENTINEL.token}`;
const apiReservationUrl = `/api/booking/reservations/${SENTINEL.reservationId}/cancel?token=${SENTINEL.token}`;

const assertNoSentinels = (value: unknown) => {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(SENTINEL.name);
  expect(serialized).not.toContain(SENTINEL.email);
  expect(serialized).not.toContain(SENTINEL.notes);
  expect(serialized).not.toContain(SENTINEL.token);
  expect(serialized).not.toContain(SENTINEL.slug);
  expect(serialized).not.toContain(SENTINEL.reservationId);
};

describe("classifyBookingPath", () => {
  it("classifies guest web routes before treating the action as a slug", () => {
    expect(
      classifyBookingPath(`/meet/confirmed/${SENTINEL.reservationId}`),
    ).toEqual({
      category: "meet_confirmed",
      canonicalPath: "/meet/confirmed/:reservationId",
    });
    expect(classifyBookingPath(`/meet/${SENTINEL.slug}`)).toEqual({
      category: "meet_page",
      canonicalPath: "/meet/:slug",
    });
    expect(
      classifyBookingPath(`/book/reschedule/${SENTINEL.reservationId}`),
    ).toEqual({
      category: "book_reschedule",
      canonicalPath: "/book/reschedule/:reservationId",
    });
  });

  it("classifies public and admin API paths", () => {
    expect(
      classifyBookingPath(`/api/booking/pages/${SENTINEL.slug}/slots`),
    ).toEqual({
      category: "api_booking_slots",
      canonicalPath: "/api/booking/pages/:slug/slots",
    });
    expect(
      classifyBookingPath(
        `/api/booking/reservations/${SENTINEL.reservationId}`,
      ),
    ).toEqual({
      category: "api_booking_reservation",
      canonicalPath: "/api/booking/reservations/:reservationId",
    });
    expect(classifyBookingPath("/api/booking/page/new-meetings/claim")).toEqual(
      {
        category: "api_booking_admin",
        canonicalPath: "/api/booking/page/new-meetings/claim",
      },
    );
  });
});

describe("public booking path guards", () => {
  it("treats /meet and /book trees as public booking surfaces", () => {
    expect(isPublicBookingPath(`/meet/${SENTINEL.slug}`)).toBe(true);
    expect(isPublicBookingPath(confirmedUrl)).toBe(true);
    expect(isPublicBookingPath("/week/2026-09-13")).toBe(false);
    expect(isBookingCapabilityPath(confirmedUrl)).toBe(true);
    expect(isBookingCapabilityPath(`/meet/${SENTINEL.slug}`)).toBe(false);
  });
});

describe("redactBookingUrl", () => {
  it("rewrites permalinks and strips the capability query", () => {
    expect(redactBookingUrl(confirmedUrl)).toBe(
      "https://compasscalendar.com/meet/confirmed/:reservationId",
    );
    expect(redactBookingUrl(hostPageUrl)).toBe(
      "https://compasscalendar.com/meet/:slug",
    );
    expect(redactBookingUrl(legacyCancelUrl)).toBe(
      "https://compasscalendar.com/book/cancel/:reservationId",
    );
    expect(redactBookingUrl(apiReservationUrl)).toBe(
      "/api/booking/reservations/:reservationId/cancel",
    );
    assertNoSentinels(redactBookingUrl(confirmedUrl));
  });

  it("keeps slot-window query keys and drops token", () => {
    const raw = `/api/booking/pages/${SENTINEL.slug}/slots?start=2026-09-01T00:00:00.000Z&end=2026-10-01T00:00:00.000Z&timeZone=America/New_York&token=${SENTINEL.token}`;
    expect(redactBookingUrl(raw)).toBe(
      "/api/booking/pages/:slug/slots?start=2026-09-01T00:00:00.000Z&end=2026-10-01T00:00:00.000Z&timeZone=America/New_York",
    );
    assertNoSentinels(redactBookingUrl(raw));
  });

  it("leaves unrelated URLs unchanged", () => {
    expect(redactBookingUrl("https://example.com/week")).toBe(
      "https://example.com/week",
    );
  });
});

describe("sanitizeBookingTelemetry", () => {
  it("redacts nested pageview, exception, and referrer fields", () => {
    const payload = sanitizeBookingTelemetry(
      {
        event: "$pageview",
        properties: {
          $current_url: confirmedUrl,
          $pathname: `/meet/confirmed/${SENTINEL.reservationId}`,
          $referrer: hostPageUrl,
          $initial_referrer: legacyCancelUrl,
          $set: {
            $initial_current_url: confirmedUrl,
            email: SENTINEL.email,
          },
          guestName: SENTINEL.name,
          notes: SENTINEL.notes,
          token: SENTINEL.token,
          reservationId: SENTINEL.reservationId,
          slug: SENTINEL.slug,
          $exception_values: [
            `Failed GET ${apiReservationUrl} for ${SENTINEL.email}`,
          ],
        },
      },
      { dropUnsafeKeys: true },
    );

    assertNoSentinels(payload);
    expect(payload.properties.$current_url).toBe(
      "https://compasscalendar.com/meet/confirmed/:reservationId",
    );
    expect(payload.properties.$pathname).toBe("/meet/confirmed/:reservationId");
    expect(payload.properties.$set?.email).toBeUndefined();
    expect(payload.properties.guestName).toBeUndefined();
    expect(bookingRouteCategoryFromUrl(payload.properties.$current_url)).toBe(
      "meet_confirmed",
    );
  });

  it("redacts secrets inside log lines without dropping diagnostic keys", () => {
    const line = redactBookingSecretsFromString(
      `GET ${confirmedUrl} guest=${SENTINEL.email}`,
    );
    expect(line).toContain("/meet/confirmed/:reservationId");
    expect(line).toContain(":email");
    assertNoSentinels(line);
  });
});

describe("isBookingUnsafeMetaKey", () => {
  it("matches guest and permalink fields, not operational counters", () => {
    expect(isBookingUnsafeMetaKey("reservationId")).toBe(true);
    expect(isBookingUnsafeMetaKey("guest_email")).toBe(true);
    expect(isBookingUnsafeMetaKey("bookingUrl")).toBe(true);
    expect(isBookingUnsafeMetaKey("userId")).toBe(false);
    expect(isBookingUnsafeMetaKey("token")).toBe(true);
    expect(isBookingUnsafeMetaKey("durationMs")).toBe(false);
  });
});
