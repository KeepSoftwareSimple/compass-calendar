import {
  guestActionUrlFromHistory,
  publicCancelUrlForReservation,
  publicRescheduleUrlForReservation,
  tokenFromGuestActionUrl,
  validateBookingCancelSearch,
  validateBookingRescheduleSearch,
  validatePublicBookingSearch,
} from "@booking-web/booking/public-booking-search";
import { describe, expect, it } from "bun:test";

describe("validatePublicBookingSearch", () => {
  it("keeps well-formed selection params", () => {
    expect(
      validatePublicBookingSearch({
        month: "2026-09",
        date: "2026-09-07",
        slot: "2026-09-07T10:00:00.000Z",
        tz: "Europe/London",
      }),
    ).toEqual({
      month: "2026-09",
      date: "2026-09-07",
      slot: "2026-09-07T10:00:00.000Z",
      tz: "Europe/London",
    });
  });

  it("drops garbage to undefined without throwing", () => {
    expect(
      validatePublicBookingSearch({
        month: "next-month",
        date: 42,
        slot: "not-a-date",
        tz: "Mars/Olympus_Mons",
      }),
    ).toEqual({
      month: undefined,
      date: undefined,
      slot: undefined,
      tz: undefined,
    });
  });

  it("handles an empty search", () => {
    expect(validatePublicBookingSearch({})).toEqual({
      month: undefined,
      date: undefined,
      slot: undefined,
      tz: undefined,
    });
  });
});

describe("validateBookingCancelSearch", () => {
  it("keeps a non-empty token", () => {
    expect(validateBookingCancelSearch({ token: "abc123" })).toEqual({
      token: "abc123",
    });
  });

  it("drops empty and non-string tokens", () => {
    expect(validateBookingCancelSearch({ token: "" })).toEqual({
      token: undefined,
    });
    expect(validateBookingCancelSearch({ token: 7 })).toEqual({
      token: undefined,
    });
    expect(validateBookingCancelSearch({})).toEqual({ token: undefined });
  });
});

describe("validateBookingRescheduleSearch", () => {
  it("keeps token and picker selection together", () => {
    expect(
      validateBookingRescheduleSearch({
        token: "abc",
        month: "2026-09",
        date: "2026-09-07",
        slot: "2026-09-07T10:00:00.000Z",
        tz: "UTC",
      }),
    ).toEqual({
      token: "abc",
      month: "2026-09",
      date: "2026-09-07",
      slot: "2026-09-07T10:00:00.000Z",
      tz: "UTC",
    });
  });
});

describe("tokenFromGuestActionUrl", () => {
  it("reads token from an absolute cancel URL", () => {
    expect(
      tokenFromGuestActionUrl(
        "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
      ),
    ).toBe("abc");
  });

  it("reads token from a relative URL", () => {
    expect(tokenFromGuestActionUrl("/meet/cancel/99?token=secret")).toBe(
      "secret",
    );
  });

  it("returns empty when token is missing or the URL is unusable", () => {
    expect(tokenFromGuestActionUrl("/meet/cancel/99")).toBe("");
    expect(tokenFromGuestActionUrl("://bad")).toBe("");
  });
});

describe("publicCancelUrlForReservation", () => {
  it("builds an origin-absolute cancel URL", () => {
    expect(
      publicCancelUrlForReservation(
        "000000000000000000000099",
        "abc",
        "https://staging.compasscalendar.com",
      ),
    ).toBe(
      "https://staging.compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
    );
  });
});

describe("publicRescheduleUrlForReservation", () => {
  it("builds an origin-absolute reschedule URL", () => {
    expect(
      publicRescheduleUrlForReservation(
        "000000000000000000000099",
        "abc",
        "https://staging.compasscalendar.com",
      ),
    ).toBe(
      "https://staging.compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
    );
  });
});

describe("guestActionUrlFromHistory", () => {
  it("reads cancel and reschedule URLs from history state", () => {
    expect(
      guestActionUrlFromHistory(
        { cancelUrl: "https://example.com/cancel?token=a" },
        "cancelUrl",
      ),
    ).toBe("https://example.com/cancel?token=a");
    expect(
      guestActionUrlFromHistory(
        { rescheduleUrl: "https://example.com/reschedule?token=a" },
        "rescheduleUrl",
      ),
    ).toBe("https://example.com/reschedule?token=a");
  });

  it("ignores missing, empty, and non-string values", () => {
    expect(guestActionUrlFromHistory(undefined, "cancelUrl")).toBeUndefined();
    expect(guestActionUrlFromHistory({}, "rescheduleUrl")).toBeUndefined();
    expect(
      guestActionUrlFromHistory({ cancelUrl: "" }, "cancelUrl"),
    ).toBeUndefined();
    expect(
      guestActionUrlFromHistory({ cancelUrl: 12 }, "cancelUrl"),
    ).toBeUndefined();
  });
});
