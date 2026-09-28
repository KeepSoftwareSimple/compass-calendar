import { parseBookingEventLinks } from "@web/booking/booking-event-links";
import { describe, expect, it } from "bun:test";

const reservationId = "507f1f77bcf86cd799439011";
const token = "guest-plaintext-token-9f3c";
const cancelUrl = `https://compass.example/meet/cancel/${reservationId}?token=${token}`;
const rescheduleUrl = `https://compass.example/meet/reschedule/${reservationId}?token=${token}`;

const backendDescription = (notes?: string) => {
  const links = `<a href="${cancelUrl}">Cancel</a> | <a href="${rescheduleUrl}">Reschedule</a>`;
  if (!notes?.trim()) return links;
  return `${notes.replace(/\n/g, "<br>")}<br><br>${links}`;
};

describe("parseBookingEventLinks", () => {
  it("parses both anchors from a backend-shaped description without guest notes", () => {
    expect(parseBookingEventLinks(backendDescription())).toEqual({
      reservationId,
      token,
      cancelUrl,
      rescheduleUrl,
    });
  });

  it("parses both anchors when guest notes precede the links", () => {
    expect(
      parseBookingEventLinks(backendDescription("Looking forward to it")),
    ).toEqual({
      reservationId,
      token,
      cancelUrl,
      rescheduleUrl,
    });
  });

  it("returns null when only the cancel anchor is present", () => {
    expect(
      parseBookingEventLinks(`<a href="${cancelUrl}">Cancel</a>`),
    ).toBeNull();
  });

  it("returns null when no booking anchors are present", () => {
    expect(parseBookingEventLinks("<p>Team sync</p>")).toBeNull();
  });

  it("returns null when the path is not a meet cancel/reschedule link", () => {
    expect(
      parseBookingEventLinks(
        `<a href="https://compass.example/book/cancel/${reservationId}?token=${token}">Cancel</a> | <a href="${rescheduleUrl}">Reschedule</a>`,
      ),
    ).toBeNull();
  });
});
