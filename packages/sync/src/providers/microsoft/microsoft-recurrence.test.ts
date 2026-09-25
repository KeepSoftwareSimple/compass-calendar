import {
  fromRRule,
  toRRule,
} from "@sync/providers/microsoft/microsoft-recurrence";
import { UnsupportedRecurrenceError } from "@sync/providers/microsoft/microsoft-recurrence.error";
import {
  type GraphDayOfWeek,
  type GraphPatternedRecurrence,
  type GraphRecurrencePattern,
  type GraphRecurrenceRange,
} from "@sync/providers/microsoft/microsoft-recurrence.types";

const START = "2024-03-04";
const PACIFIC = "Pacific Standard Time";
const PACIFIC_IANA = "America/Los_Angeles";

function recurrence(
  pattern: GraphRecurrencePattern,
  range: GraphRecurrenceRange,
): GraphPatternedRecurrence {
  return { pattern, range };
}

function noEnd(
  overrides: Partial<GraphRecurrenceRange> = {},
): GraphRecurrenceRange {
  return { type: "noEnd", startDate: START, ...overrides };
}

function numbered(count: number): GraphRecurrenceRange {
  return {
    type: "numbered",
    startDate: START,
    numberOfOccurrences: count,
    recurrenceTimeZone: PACIFIC,
  };
}

function endDate(end: string): GraphRecurrenceRange {
  return {
    type: "endDate",
    startDate: START,
    endDate: end,
    recurrenceTimeZone: PACIFIC,
  };
}

function expectGraphRoundTrip(input: GraphPatternedRecurrence): void {
  const rules = toRRule(input);
  const back = fromRRule(rules, {
    startDate: input.range.startDate,
    ianaTimeZone: PACIFIC_IANA,
  });
  expect(back).toEqual(input);
}

describe("microsoft-recurrence", () => {
  const roundTripCases: GraphPatternedRecurrence[] = [
    recurrence({ type: "daily", interval: 1 }, noEnd()),
    recurrence({ type: "daily", interval: 3 }, noEnd()),
    recurrence(
      {
        type: "weekly",
        interval: 1,
        daysOfWeek: ["monday"],
        firstDayOfWeek: "sunday",
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "weekly",
        interval: 2,
        daysOfWeek: ["monday", "wednesday"],
        firstDayOfWeek: "monday",
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "weekly",
        interval: 1,
        daysOfWeek: ["friday"],
        firstDayOfWeek: "friday",
      },
      noEnd(),
    ),
    recurrence(
      { type: "absoluteMonthly", interval: 1, dayOfMonth: 15 },
      noEnd(),
    ),
    recurrence(
      { type: "absoluteMonthly", interval: 3, dayOfMonth: 1 },
      noEnd(),
    ),
    recurrence(
      {
        type: "relativeMonthly",
        interval: 1,
        daysOfWeek: ["thursday"],
        index: "second",
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "relativeMonthly",
        interval: 2,
        daysOfWeek: ["friday"],
        index: "last",
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "relativeMonthly",
        interval: 1,
        daysOfWeek: ["monday", "tuesday"],
        index: "third",
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "absoluteYearly",
        interval: 1,
        month: 3,
        dayOfMonth: 15,
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "absoluteYearly",
        interval: 2,
        month: 12,
        dayOfMonth: 31,
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "relativeYearly",
        interval: 1,
        month: 11,
        daysOfWeek: ["thursday", "friday"],
        index: "second",
      },
      noEnd(),
    ),
    recurrence(
      {
        type: "relativeYearly",
        interval: 3,
        month: 6,
        daysOfWeek: ["monday"],
        index: "last",
      },
      noEnd(),
    ),
    recurrence({ type: "daily", interval: 1 }, numbered(10)),
    recurrence(
      {
        type: "weekly",
        interval: 1,
        daysOfWeek: ["tuesday"],
        firstDayOfWeek: "sunday",
      },
      numbered(6),
    ),
    recurrence(
      { type: "absoluteMonthly", interval: 1, dayOfMonth: 5 },
      numbered(12),
    ),
    recurrence({ type: "daily", interval: 1 }, endDate("2024-12-31")),
    recurrence(
      {
        type: "weekly",
        interval: 1,
        daysOfWeek: ["wednesday"],
        firstDayOfWeek: "sunday",
      },
      endDate("2025-06-30"),
    ),
    recurrence(
      {
        type: "relativeMonthly",
        interval: 1,
        daysOfWeek: ["friday"],
        index: "first",
      },
      endDate("2024-09-01"),
    ),
    recurrence(
      {
        type: "absoluteYearly",
        interval: 1,
        month: 7,
        dayOfMonth: 4,
      },
      endDate("2030-07-04"),
    ),
    recurrence(
      {
        type: "weekly",
        interval: 1,
        daysOfWeek: ["saturday", "sunday"],
        firstDayOfWeek: "saturday",
      },
      numbered(8),
    ),
    recurrence(
      {
        type: "relativeMonthly",
        interval: 4,
        daysOfWeek: ["wednesday"],
        index: "fourth",
      },
      endDate("2026-03-31"),
    ),
    recurrence(
      {
        type: "relativeYearly",
        interval: 2,
        month: 2,
        daysOfWeek: ["tuesday"],
        index: "third",
      },
      numbered(5),
    ),
    recurrence(
      {
        type: "weekly",
        interval: 3,
        daysOfWeek: ["thursday"],
        firstDayOfWeek: "wednesday",
      },
      endDate("2027-01-01"),
    ),
    recurrence(
      { type: "absoluteMonthly", interval: 6, dayOfMonth: 28 },
      endDate("2028-06-28"),
    ),
  ];

  it.each(roundTripCases.map((value, index) => [index, value] as const))(
    "round-trips Graph patternedRecurrence table row %i",
    (_index, input) => {
      expectGraphRoundTrip(input);
    },
  );

  const supportedRules: readonly (readonly string[])[] = [
    ["RRULE:FREQ=DAILY"],
    ["RRULE:FREQ=DAILY;INTERVAL=2"],
    ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE;WKST=MO"],
    ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR;WKST=SU"],
    ["RRULE:FREQ=MONTHLY;BYMONTHDAY=10"],
    ["RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1"],
    ["RRULE:FREQ=MONTHLY;BYDAY=2TU"],
    ["RRULE:FREQ=MONTHLY;BYDAY=-1FR"],
    ["RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=3MO,3WE"],
    ["RRULE:FREQ=YEARLY;BYMONTH=5;BYMONTHDAY=20"],
    ["RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=2TH"],
    ["RRULE:FREQ=YEARLY;INTERVAL=2;BYMONTH=1;BYDAY=-1MO"],
    ["RRULE:FREQ=DAILY;COUNT=7"],
    ["RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=4;WKST=SU"],
    ["RRULE:FREQ=MONTHLY;BYMONTHDAY=15;COUNT=6"],
    ["RRULE:FREQ=DAILY;UNTIL=20241231T075959Z"],
    ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20240630T065959Z;WKST=SU"],
    ["RRULE:FREQ=MONTHLY;BYDAY=1SU"],
    ["RRULE:FREQ=MONTHLY;BYDAY=4TH"],
    ["RRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25;COUNT=10"],
  ];

  it.each(supportedRules.map((rules, index) => [index, rules] as const))(
    "round-trips supported RRULE property case %i",
    (_index, rules) => {
      const normalized = toRRule(
        fromRRule(rules, { startDate: START, ianaTimeZone: PACIFIC_IANA }),
      );
      expect(
        toRRule(
          fromRRule(normalized, {
            startDate: START,
            ianaTimeZone: PACIFIC_IANA,
          }),
        ),
      ).toEqual(normalized);
    },
  );

  it("rejects unsupported RRULE features for Graph writes", () => {
    const rejects = [
      "RRULE:FREQ=HOURLY",
      "RRULE:FREQ=DAILY;BYHOUR=9",
      "RRULE:FREQ=MONTHLY;BYSETPOS=1;BYDAY=MO",
      "RRULE:FREQ=YEARLY;BYMONTH=1,6;BYMONTHDAY=1",
      "RRULE:FREQ=MONTHLY;BYDAY=1MO,3FR",
    ];

    for (const rule of rejects) {
      expect(() =>
        fromRRule([rule], { startDate: START, ianaTimeZone: PACIFIC_IANA }),
      ).toThrow(UnsupportedRecurrenceError);
    }
  });

  it("exposes unsupportedRecurrence as the error reason", () => {
    try {
      fromRRule(["RRULE:FREQ=DAILY;BYHOUR=1"], {
        startDate: START,
        ianaTimeZone: PACIFIC_IANA,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedRecurrenceError);
      expect((error as UnsupportedRecurrenceError).reason).toBe(
        "unsupportedRecurrence",
      );
      return;
    }
    throw new Error("expected fromRRule to throw");
  });

  it("sorts daysOfWeek in calendar order when writing Graph patterns", () => {
    const rules = toRRule(
      recurrence(
        {
          type: "weekly",
          interval: 1,
          daysOfWeek: ["wednesday", "monday"],
          firstDayOfWeek: "sunday",
        },
        noEnd(),
      ),
    );
    const graph = fromRRule(rules, {
      startDate: START,
      ianaTimeZone: PACIFIC_IANA,
    });
    expect(graph.pattern.daysOfWeek).toEqual(["monday", "wednesday"]);
  });

  it("maps last weekday index to -1 BYDAY tokens", () => {
    const rules = toRRule(
      recurrence(
        {
          type: "relativeMonthly",
          interval: 1,
          daysOfWeek: ["friday"],
          index: "last",
        },
        noEnd(),
      ),
    );
    expect(rules[0]).toContain("BYDAY=-1FR");
  });
});

describe("microsoft-recurrence day coverage", () => {
  const days: GraphDayOfWeek[] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  it.each(days)("round-trips weekly %s", (day) => {
    expectGraphRoundTrip(
      recurrence(
        {
          type: "weekly",
          interval: 1,
          daysOfWeek: [day],
          firstDayOfWeek: "sunday",
        },
        noEnd(),
      ),
    );
  });
});
