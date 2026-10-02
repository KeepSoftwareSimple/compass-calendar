import { ObjectId } from "bson";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import { createMockBaseEvent } from "@core/util/test/ccal.event.factory";

const FIRST_N = 5;
const FIXED_EVENT_ID = new ObjectId("507f1f77bcf86cd799439011");
const DAILY_START = "2026-01-01T10:00:00.000Z";
const DAILY_END = "2026-01-01T11:00:00.000Z";

export const buildRruleFixtures = () => {
  const dailyRule = "RRULE:FREQ=DAILY;COUNT=3";
  const dailyBase = createMockBaseEvent(
    {
      _id: FIXED_EVENT_ID.toString(),
      startDate: DAILY_START,
      recurrence: { rule: [dailyRule] },
    },
    false,
    { value: 1, unit: "hour" },
  );
  const daily = new CompassEventRRule(
    {
      ...dailyBase,
      _id: FIXED_EVENT_ID,
    },
    { tzid: "UTC" },
  );

  const weeklyStart = "2026-01-05T12:00:00.000Z";
  const weeklyEnd = "2026-01-05T13:00:00.000Z";
  const weeklyRule = "RRULE:FREQ=WEEKLY;COUNT=0;BYDAY=FR";
  const weeklyBase = createMockBaseEvent(
    {
      _id: FIXED_EVENT_ID.toString(),
      startDate: weeklyStart,
      recurrence: { rule: [weeklyRule] },
    },
    false,
    { value: 1, unit: "hour" },
  );
  const weekly = new CompassEventRRule(
    {
      ...weeklyBase,
      _id: FIXED_EVENT_ID,
    },
    { tzid: "UTC" },
  );

  const formatInstance = (date: Date) => date.toISOString();

  return {
    cases: [
      {
        id: "daily-count-3",
        input: {
          startDate: DAILY_START,
          endDate: DAILY_END,
          recurrenceRule: dailyRule,
          timeZone: "UTC",
          firstN: FIRST_N,
        },
        output: {
          summary: daily.toString(),
          instances: daily
            .all((_, index) => index < FIRST_N)
            .map(formatInstance),
        },
      },
      {
        id: "weekly-byday-fr-with-dtstart",
        input: {
          startDate: weeklyStart,
          endDate: weeklyEnd,
          recurrenceRule: weeklyRule,
          timeZone: "UTC",
          firstN: FIRST_N,
        },
        output: {
          summary: weekly.toString(),
          instances: weekly
            .all((_, index) => index < FIRST_N)
            .map(formatInstance),
        },
      },
    ],
  };
};

export const emitRruleFixturesJson = (): string =>
  `${JSON.stringify(buildRruleFixtures(), null, 2)}\n`;
