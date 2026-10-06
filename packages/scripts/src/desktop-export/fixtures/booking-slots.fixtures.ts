import {
  type ComputeBookingSlotsInput,
  computeBookingSlots,
} from "@core/booking/compute-booking-slots";

type BookingSlotsVectorCase = {
  id: string;
  input: {
    timeZone: string;
    durationMinutes: number;
    weeklyAvailability: ComputeBookingSlotsInput["weeklyAvailability"];
    minNoticeHours: number;
    maxHorizonDays: number;
    busyIntervals: { start: string; end: string }[];
    confirmedReservationStarts: string[];
    now: string;
    windowStart: string;
    windowEnd: string;
  };
  output: { slots: string[] };
};

const denver = "America/Denver";

const serializeInput = (
  input: ComputeBookingSlotsInput,
): BookingSlotsVectorCase["input"] => ({
  timeZone: input.timeZone,
  durationMinutes: input.durationMinutes,
  weeklyAvailability: input.weeklyAvailability,
  minNoticeHours: input.minNoticeHours,
  maxHorizonDays: input.maxHorizonDays,
  busyIntervals: input.busyIntervals.map((interval) => ({
    start: interval.start.toISOString(),
    end: interval.end.toISOString(),
  })),
  confirmedReservationStarts: input.confirmedReservationStarts.map((start) =>
    start.toISOString(),
  ),
  now: input.now.toISOString(),
  windowStart: input.windowStart.toISOString(),
  windowEnd: input.windowEnd.toISOString(),
});

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

const buildCase = (
  id: string,
  input: ComputeBookingSlotsInput,
): BookingSlotsVectorCase => ({
  id,
  input: serializeInput(input),
  output: { slots: computeBookingSlots(input) },
});

export const buildBookingSlotsFixtures = () => ({
  cases: [
    buildCase("mon-wed-grid", baseInput()),
    buildCase(
      "empty-weekly-availability",
      baseInput({ weeklyAvailability: [] }),
    ),
    buildCase(
      "busy-interval-gap",
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
    ),
    buildCase(
      "min-notice",
      baseInput({
        minNoticeHours: 4,
        now: new Date("2026-09-07T14:30:00.000Z"),
        windowStart: new Date("2026-09-07T06:00:00.000Z"),
        windowEnd: new Date("2026-09-08T06:00:00.000Z"),
        weeklyAvailability: [{ weekday: 1, start: "09:00", end: "17:00" }],
      }),
    ),
    buildCase(
      "horizon-cap",
      baseInput({
        now: new Date("2026-09-01T00:00:00.000Z"),
        maxHorizonDays: 60,
        windowStart: new Date("2026-11-01T06:00:00.000Z"),
        windowEnd: new Date("2026-11-02T06:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "09:00", end: "10:00" }],
      }),
    ),
    buildCase(
      "dst-fall-back",
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-10-25T00:00:00.000Z"),
        windowStart: new Date("2026-11-01T04:00:00.000Z"),
        windowEnd: new Date("2026-11-02T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "01:00", end: "03:30" }],
        durationMinutes: 30,
      }),
    ),
    buildCase(
      "spring-forward-gap",
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-03-01T00:00:00.000Z"),
        windowStart: new Date("2026-03-08T05:00:00.000Z"),
        windowEnd: new Date("2026-03-09T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "02:00", end: "02:30" }],
        durationMinutes: 30,
      }),
    ),
    buildCase(
      "spring-forward-surround",
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-03-01T00:00:00.000Z"),
        windowStart: new Date("2026-03-08T05:00:00.000Z"),
        windowEnd: new Date("2026-03-09T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "01:00", end: "04:00" }],
        durationMinutes: 30,
      }),
    ),
    buildCase(
      "spring-forward-end-outside-hours",
      baseInput({
        timeZone: "America/New_York",
        now: new Date("2026-03-01T00:00:00.000Z"),
        windowStart: new Date("2026-03-08T05:00:00.000Z"),
        windowEnd: new Date("2026-03-09T08:00:00.000Z"),
        weeklyAvailability: [{ weekday: 7, start: "01:30", end: "02:30" }],
        durationMinutes: 30,
      }),
    ),
  ],
});

export const emitBookingSlotsFixturesJson = (): string =>
  `${JSON.stringify(buildBookingSlotsFixtures(), null, 2)}\n`;
