import {
  bookingPublicRateLimitKey,
  normalizeBookingClientIp,
} from "@backend/booking/booking-client-ip";
import { describe, expect, it } from "bun:test";

describe("normalizeBookingClientIp", () => {
  it("maps IPv4-mapped IPv6 and strips an IPv4 port", () => {
    expect(normalizeBookingClientIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(normalizeBookingClientIp("203.0.113.9:443")).toBe("203.0.113.9");
  });

  it("collapses IPv6 to a /64 bucket", () => {
    expect(normalizeBookingClientIp("2001:db8:1:2:3:4:5:6")).toBe(
      "2001:db8:1:2::",
    );
  });

  it("does not invent an address when Express has none", () => {
    expect(normalizeBookingClientIp(undefined)).toBe("unknown");
  });
});

describe("bookingPublicRateLimitKey", () => {
  it("joins the normalized IP with the route target", () => {
    expect(bookingPublicRateLimitKey("::ffff:127.0.0.1", "host-slug")).toBe(
      "127.0.0.1:host-slug",
    );
    expect(bookingPublicRateLimitKey("127.0.0.1", undefined)).toBe(
      "127.0.0.1:unknown",
    );
  });
});
