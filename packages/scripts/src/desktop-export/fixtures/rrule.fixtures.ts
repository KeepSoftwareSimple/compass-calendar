import { ObjectId } from "bson";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import { createMockBaseEvent } from "@core/util/test/ccal.event.factory";

const FIXED_EVENT_ID = new ObjectId("507f1f77bcf86cd799439011");

type RruleVectorCase = {
  id: string;
  input: {
    startDate: string;
    endDate: string;
    recurrenceRule: string;
    timeZone: string;
    firstN: number;
  };
  output: {
    summary: string;
    instances: string[];
  };
};

const buildCase = (
  id: string,
  startDate: string,
  endDate: string,
  recurrenceRule: string,
  timeZone: string,
  firstN: number,
): RruleVectorCase => {
  const base = createMockBaseEvent(
    {
      _id: FIXED_EVENT_ID.toString(),
      startDate,
      recurrence: { rule: [recurrenceRule] },
    },
    false,
    { value: 1, unit: "hour" },
  );
  const rrule = new CompassEventRRule(
    {
      ...base,
      _id: FIXED_EVENT_ID,
    },
    { tzid: timeZone },
  );

  return {
    id,
    input: {
      startDate,
      endDate,
      recurrenceRule,
      timeZone,
      firstN,
    },
    output: {
      summary: rrule.toString(),
      instances: rrule
        .all((_, index) => index < firstN)
        .map((date) => date.toISOString()),
    },
  };
};

export const buildRruleFixtures = () => ({
  cases: [
    buildCase(
      "daily-count-3",
      "2026-01-01T10:00:00.000Z",
      "2026-01-01T11:00:00.000Z",
      "RRULE:FREQ=DAILY;COUNT=3",
      "UTC",
      5,
    ),
    buildCase(
      "weekly-byday-fr-with-dtstart",
      "2026-01-05T12:00:00.000Z",
      "2026-01-05T13:00:00.000Z",
      "RRULE:FREQ=WEEKLY;COUNT=0;BYDAY=FR",
      "UTC",
      5,
    ),
    buildCase(
      "weekly-dst-spring-denver",
      "2026-03-01T09:00:00-07:00",
      "2026-03-01T10:00:00-07:00",
      "RRULE:FREQ=WEEKLY;COUNT=3",
      "America/Denver",
      5,
    ),
    buildCase(
      "until-daily-denver-phantom",
      "2026-06-01T03:00:00-06:00",
      "2026-06-01T03:15:00-06:00",
      "RRULE:FREQ=DAILY;UNTIL=20260610T055959Z",
      "America/Denver",
      20,
    ),
    buildCase(
      "until-daily-kolkata",
      "2026-06-01T20:00:00+05:30",
      "2026-06-01T20:30:00+05:30",
      "RRULE:FREQ=DAILY;UNTIL=20260605T182959Z",
      "Asia/Kolkata",
      20,
    ),
    buildCase(
      "weekly-byday-sa-denver",
      "2026-07-23T19:00:00-06:00",
      "2026-07-23T20:00:00-06:00",
      "RRULE:FREQ=WEEKLY;BYDAY=SA",
      "America/Denver",
      3,
    ),
    buildCase(
      "monthly-bymonthday",
      "2026-01-15T10:00:00.000Z",
      "2026-01-15T11:00:00.000Z",
      "RRULE:FREQ=MONTHLY;COUNT=3;BYMONTHDAY=15",
      "UTC",
      5,
    ),
    buildCase(
      "weekly-interval-byday",
      "2026-01-01T10:00:00.000Z",
      "2026-01-01T11:00:00.000Z",
      "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=MO,WE",
      "UTC",
      10,
    ),
    buildCase(
      "until-roundtrip-denver",
      "2026-07-23T19:00:00-06:00",
      "2026-07-23T20:00:00-06:00",
      "RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20270601T010000Z",
      "America/Denver",
      5,
    ),
  ],
});

export const emitRruleFixturesJson = (): string =>
  `${JSON.stringify(buildRruleFixtures(), null, 2)}\n`;
