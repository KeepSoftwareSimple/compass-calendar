import {
  type ComputeBookingSlotsInput,
  computeBookingSlots,
  mergeBookingBusyIntervals,
} from "@core/booking/compute-booking-slots";
import { describe, expect, it } from "bun:test";

const denver = "America/Denver";

const baseInput = (
  overrides: Partial<ComputeBookingSlotsInput> = {},
): ComputeBookingSlotsInput => ({
  timeZone: denver,
  durationMinutes: 30,
  weeklyAvailability: [
    { weekday: 1, start: "09:00", end: "12:00" },
    { weekday: 3, start: "09:00", end: "12:00" },
  ],
  minNoticeHours: 0,
  maxHorizonDays: 60,
  busyIntervals: [],
  confirmedReservationStarts: [],
  now: new Date("2026-09-01T12:00:00.000Z"),
  windowStart: new Date("2026-09-07T06:00:00.000Z"),
  windowEnd: new Date("2026-09-14T06:00:00.000Z"),
  ...overrides,
});

describe("mergeBookingBusyIntervals", () => {
  it("merges overlapping and touching half-open intervals", () => {
    const start = new Date("2026-09-07T10:00:00.000Z");
    const mid = new Date("2026-09-07T11:00:00.000Z");
    const end = new Date("2026-09-07T12:00:00.000Z");

    expect(
      mergeBookingBusyIntervals([
        { start, end: mid },
        { start: mid, end },
      ]),
    ).toEqual([{ start, end }]);
  });
});

describe("computeBookingSlots", () => {
  it("returns 15-minute starts that fit before noon on Mon/Wed", () => {
    const slots = computeBookingSlots(baseInput());

    const mondayStarts = slots.filter((slot) => slot.startsWith("2026-09-07"));
    const wednesdayStarts = slots.filter((slot) =>
      slot.startsWith("2026-09-09"),
    );

    expect(mondayStarts).toEqual([
      "2026-09-07T15:00:00Z",
      "2026-09-07T15:15:00Z",
      "2026-09-07T15:30:00Z",
      "2026-09-07T15:45:00Z",
      "2026-09-07T16:00:00Z",
      "2026-09-07T16:15:00Z",
      "2026-09-07T16:30:00Z",
      "2026-09-07T16:45:00Z",
      "2026-09-07T17:00:00Z",
      "2026-09-07T17:15:00Z",
      "2026-09-07T17:30:00Z",
    ]);
    expect(wednesdayStarts).toEqual(
      mondayStarts.map((slot) => slot.replace("2026-09-07", "2026-09-09")),
    );
  });

  it("returns no slots when weekly availability is empty", () => {
    expect(
      computeBookingSlots(
        baseInput({
          weeklyAvailability: [],
        }),
      ),
    ).toEqual([]);
  });

  it("offers adjacent 30-minute slots on both sides of a busy interval", () => {
    const slots = computeBookingSlots(
      baseInput({
        busyIntervals: [
          {
            start: new Date("2026-09-07T16:00:00.000Z"),
            end: new Date("2026-09-07T17:00:00.000Z"),
          },
        ],
        windowStart: new Date("2026-09-07T06:00:00.000Z"),
        windowEnd: new Date("2026-09-08T06:00:00.000Z"),
        weeklyAvailability: [{ weekday: 1, start: "09:00", end: "12:00" }],
      }),
    );

    expect(slots).toContain("2026-09-07T15:30:00Z");
    expect(slots).toContain("2026-09-07T17:00:00Z");
    expect(slots).not.toContain("2026-09-07T16:00:00Z");
    expect(slots).not.toContain("2026-09-07T16:30:00Z");
  });

  it("enforces minimum notice", () => {
    const slots = computeBookingSlots(
      baseInput({
        minNoticeHours: 4,
        now: new Date("2026-09-07T14:30:00.000Z"),
        windowStart: new Date("2026-09-07T06:00:00.000Z"),
        windowEnd: new Date("2026-09-08T06:00:00.000Z"),
        weeklyAvailability: [{ weekday: 1, start: "09:00", end: "17:00" }],
      }),
    );

    expect(slots.every((slot) => slot >= "2026-09-07T18:30:00.000Z")).toBe(
      true,
    );
    expect(slots).toContain("2026-09-07T18:30:00Z");
  });

  it("respects the 60-day horizon", () => {
    const slots = computeBookingSlots(
      baseInput({
        now: new Date("2026-09-01T00:00:00.000Z"),
        maxHorizonDays: 60,
        windowStart: new Date("2026-11-01T06:00:00.000Z"),
        windowEnd: new Date("2026-11-02T06:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "09:00", end: "10:00" }],
      }),
    );

    expect(slots).toEqual([]);
  });

  it("does not duplicate instants across DST fall-back", () => {
    const slots = computeBookingSlots(
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-10-25T00:00:00.000Z"),
        windowStart: new Date("2026-11-01T04:00:00.000Z"),
        windowEnd: new Date("2026-11-02T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "01:00", end: "03:30" }],
        durationMinutes: 30,
      }),
    );

    // Ambiguous 01:00-01:45 use the earlier EDT offset. The repeated EST hour
    // is not a second grid; 02:00 is the first unique post-fold wall time.
    expect(slots).toEqual([
      "2026-11-01T05:00:00Z",
      "2026-11-01T05:15:00Z",
      "2026-11-01T05:30:00Z",
      "2026-11-01T05:45:00Z",
      "2026-11-01T07:00:00Z",
      "2026-11-01T07:15:00Z",
      "2026-11-01T07:30:00Z",
      "2026-11-01T07:45:00Z",
      "2026-11-01T08:00:00Z",
    ]);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("returns no slots for a nonexistent spring-forward availability interval", () => {
    const slots = computeBookingSlots(
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-03-01T00:00:00.000Z"),
        windowStart: new Date("2026-03-08T05:00:00.000Z"),
        windowEnd: new Date("2026-03-09T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "02:00", end: "02:30" }],
        durationMinutes: 30,
      }),
    );

    expect(slots).toEqual([]);
  });

  it("keeps exact UTC starts around the spring-forward gap", () => {
    const slots = computeBookingSlots(
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-03-01T00:00:00.000Z"),
        windowStart: new Date("2026-03-08T05:00:00.000Z"),
        windowEnd: new Date("2026-03-09T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "01:00", end: "04:00" }],
        durationMinutes: 30,
      }),
    );

    expect(slots).toEqual([
      "2026-03-08T06:00:00Z",
      "2026-03-08T06:15:00Z",
      "2026-03-08T06:30:00Z",
      "2026-03-08T06:45:00Z",
      "2026-03-08T07:00:00Z",
      "2026-03-08T07:15:00Z",
      "2026-03-08T07:30:00Z",
    ]);
  });

  it("rejects a duration that would end outside hours after the spring gap", () => {
    const slots = computeBookingSlots(
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-03-01T00:00:00.000Z"),
        windowStart: new Date("2026-03-08T05:00:00.000Z"),
        windowEnd: new Date("2026-03-09T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "01:30", end: "02:30" }],
        durationMinutes: 30,
      }),
    );

    expect(slots).toEqual([]);
  });
});
