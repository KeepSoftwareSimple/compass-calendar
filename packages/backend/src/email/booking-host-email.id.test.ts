import {
  buildBookingHostEmailLedgerId,
  isBookingHostEmailKind,
  parseBookingHostEmailLedgerId,
} from "@backend/email/booking-host-email.id";
import { describe, expect, it } from "bun:test";

describe("booking-host-email.id", () => {
  it("builds and parses a stable ledger id", () => {
    const at = new Date("2026-10-23T18:00:00.000Z");
    const id = buildBookingHostEmailLedgerId({
      reservationId: "507f1f77bcf86cd799439011",
      lastGuestActionAt: at,
      kind: "booked",
    });
    expect(id).toBe(
      `booking-host:507f1f77bcf86cd799439011:${at.getTime()}:booked`,
    );
    expect(parseBookingHostEmailLedgerId(id)).toEqual({
      reservationId: "507f1f77bcf86cd799439011",
      kind: "booked",
    });
  });

  it("accepts only host-alert guest actions", () => {
    expect(isBookingHostEmailKind("booked")).toBe(true);
    expect(isBookingHostEmailKind("cancelled")).toBe(true);
    expect(isBookingHostEmailKind("rescheduled")).toBe(true);
    expect(isBookingHostEmailKind("edited")).toBe(false);
    expect(isBookingHostEmailKind(undefined)).toBe(false);
  });
});
