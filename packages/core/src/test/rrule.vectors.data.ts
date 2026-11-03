/**
 * Shared RRULE vector inputs for desktop-export JSON (macOS RecurrenceParityTests),
 * core CompassEventRRule parity tests, and sync occurrence-projection cases.
 */
export type RruleVectorInput = {
  readonly id: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly recurrenceRule: string;
  readonly timeZone: string;
  readonly firstN: number;
};

export const RRULE_VECTOR_INPUTS: readonly RruleVectorInput[] = [
  {
    id: "daily-count-3",
    startDate: "2026-01-01T10:00:00.000Z",
    endDate: "2026-01-01T11:00:00.000Z",
    recurrenceRule: "RRULE:FREQ=DAILY;COUNT=3",
    timeZone: "UTC",
    firstN: 5,
  },
  {
    id: "weekly-byday-fr-with-dtstart",
    startDate: "2026-01-05T12:00:00.000Z",
    endDate: "2026-01-05T13:00:00.000Z",
    recurrenceRule: "RRULE:FREQ=WEEKLY;COUNT=0;BYDAY=FR",
    timeZone: "UTC",
    firstN: 5,
  },
  {
    id: "weekly-dst-spring-denver",
    startDate: "2026-03-01T09:00:00-07:00",
    endDate: "2026-03-01T10:00:00-07:00",
    recurrenceRule: "RRULE:FREQ=WEEKLY;COUNT=3",
    timeZone: "America/Denver",
    firstN: 5,
  },
  {
    id: "until-daily-denver-phantom",
    startDate: "2026-06-01T03:00:00-06:00",
    endDate: "2026-06-01T03:15:00-06:00",
    recurrenceRule: "RRULE:FREQ=DAILY;UNTIL=20260610T055959Z",
    timeZone: "America/Denver",
    firstN: 20,
  },
  {
    id: "until-daily-kolkata",
    startDate: "2026-06-01T20:00:00+05:30",
    endDate: "2026-06-01T20:30:00+05:30",
    recurrenceRule: "RRULE:FREQ=DAILY;UNTIL=20260605T182959Z",
    timeZone: "Asia/Kolkata",
    firstN: 20,
  },
  {
    id: "weekly-byday-sa-denver",
    startDate: "2026-07-23T19:00:00-06:00",
    endDate: "2026-07-23T20:00:00-06:00",
    recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=SA",
    timeZone: "America/Denver",
    firstN: 3,
  },
  {
    id: "monthly-bymonthday",
    startDate: "2026-01-15T10:00:00.000Z",
    endDate: "2026-01-15T11:00:00.000Z",
    recurrenceRule: "RRULE:FREQ=MONTHLY;COUNT=3;BYMONTHDAY=15",
    timeZone: "UTC",
    firstN: 5,
  },
  {
    id: "weekly-interval-byday",
    startDate: "2026-01-01T10:00:00.000Z",
    endDate: "2026-01-01T11:00:00.000Z",
    recurrenceRule: "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=MO,WE",
    timeZone: "UTC",
    firstN: 10,
  },
  {
    id: "until-roundtrip-denver",
    startDate: "2026-07-23T19:00:00-06:00",
    endDate: "2026-07-23T20:00:00-06:00",
    recurrenceRule: "RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20270601T010000Z",
    timeZone: "America/Denver",
    firstN: 5,
  },
] as const;

export const rruleVectorInput = (id: string): RruleVectorInput => {
  const found = RRULE_VECTOR_INPUTS.find((vector) => vector.id === id);
  if (!found) {
    throw new Error(`Unknown RRULE vector id: ${id}`);
  }
  return found;
};

/** Denver weekly series instants after US spring-forward 2026-03-08. */
export const RRULE_WEEKLY_DST_SPRING_DENVER_STARTS = [
  "2026-03-01T09:00:00-07:00",
  "2026-03-08T09:00:00-06:00",
  "2026-03-15T09:00:00-06:00",
] as const;
