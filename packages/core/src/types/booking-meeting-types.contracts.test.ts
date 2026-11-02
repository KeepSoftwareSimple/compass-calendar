import {
  BOOKING_DEFAULT_MEETING_TYPE_ID,
  BookingMeetingTypesSchema,
  BookingSlotsQuerySchema,
  CreateBookingReservationInputSchema,
  defaultMeetingTypes,
  resolveBookingMeetingType,
  resolveBookingMeetingTypes,
} from "@core/types/booking.contracts";
import { describe, expect, it } from "bun:test";

const intro = { id: "intro", label: "Intro call", durationMinutes: 15 };
const deep = { id: "deep-dive", label: "Deep dive", durationMinutes: 60 };

describe("BookingMeetingTypesSchema", () => {
  it("accepts one to three types", () => {
    expect(BookingMeetingTypesSchema.safeParse([intro]).success).toBe(true);
    expect(
      BookingMeetingTypesSchema.safeParse([
        intro,
        deep,
        { id: "chat", label: "Chat", durationMinutes: 30 },
      ]).success,
    ).toBe(true);
  });

  it("rejects an empty list and a fourth type", () => {
    expect(BookingMeetingTypesSchema.safeParse([]).success).toBe(false);
    expect(
      BookingMeetingTypesSchema.safeParse([
        intro,
        deep,
        { id: "a", label: "A", durationMinutes: 30 },
        { id: "b", label: "B", durationMinutes: 45 },
      ]).success,
    ).toBe(false);
  });

  it("rejects duplicate ids", () => {
    expect(
      BookingMeetingTypesSchema.safeParse([intro, { ...deep, id: "intro" }])
        .success,
    ).toBe(false);
  });

  it("rejects a blank or long label and an unsupported length", () => {
    expect(
      BookingMeetingTypesSchema.safeParse([{ ...intro, label: "   " }]).success,
    ).toBe(false);
    expect(
      BookingMeetingTypesSchema.safeParse([{ ...intro, label: "x".repeat(41) }])
        .success,
    ).toBe(false);
    expect(
      BookingMeetingTypesSchema.safeParse([{ ...intro, durationMinutes: 20 }])
        .success,
    ).toBe(false);
  });

  it("rejects ids that are not short lowercase slugs", () => {
    expect(
      BookingMeetingTypesSchema.safeParse([{ ...intro, id: "Intro Call" }])
        .success,
    ).toBe(false);
  });
});

describe("resolveBookingMeetingTypes", () => {
  it("derives one type from the duration when a page has none", () => {
    expect(resolveBookingMeetingTypes({ durationMinutes: 45 })).toEqual([
      {
        id: BOOKING_DEFAULT_MEETING_TYPE_ID,
        label: "45 min meeting",
        durationMinutes: 45,
      },
    ]);
    expect(resolveBookingMeetingTypes({ durationMinutes: 45 })).toEqual(
      defaultMeetingTypes(45),
    );
  });

  it("keeps stored types", () => {
    expect(
      resolveBookingMeetingTypes({
        durationMinutes: 15,
        meetingTypes: [intro, deep],
      }),
    ).toEqual([intro, deep]);
  });
});

describe("resolveBookingMeetingType", () => {
  it("finds the type by id", () => {
    expect(resolveBookingMeetingType([intro, deep], "deep-dive")).toEqual(deep);
  });

  it("falls back to type #1 for a missing or unknown id", () => {
    expect(resolveBookingMeetingType([intro, deep], undefined)).toEqual(intro);
    expect(resolveBookingMeetingType([intro, deep], "gone")).toEqual(intro);
  });
});

describe("meeting type ids on requests", () => {
  it("are optional on slot queries and bookings", () => {
    const query = {
      start: "2026-09-07T00:00:00.000Z",
      end: "2026-09-08T00:00:00.000Z",
      timeZone: "UTC",
    };
    expect(BookingSlotsQuerySchema.safeParse(query).success).toBe(true);
    expect(
      BookingSlotsQuerySchema.safeParse({ ...query, meetingTypeId: "intro" })
        .success,
    ).toBe(true);
    expect(
      CreateBookingReservationInputSchema.safeParse({
        slotStart: "2026-09-07T10:00:00.000Z",
        guestName: "Ada",
        guestEmail: "ada@example.com",
        guestTimeZone: "UTC",
        durationMinutes: 15,
        meetingTypeId: "intro",
      }).success,
    ).toBe(true);
  });
});
