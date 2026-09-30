import { RRule, rrulestr } from "rrule";
import dayjs from "@core/util/date/dayjs";
import { diffRRuleOptions } from "@core/util/event/event.util";

describe("diffRRuleOptions", () => {
  it("should return the differences between two rrule options", () => {
    // rrule defaults dtstart to "now" (to the second) and derives
    // byhour/byminute/bysecond from it, so every rule needs the same fixed
    // dtstart or the diff depends on when the clock ticks.
    const dtstart = dayjs.utc("2026-01-01T09:00:00Z");
    // toRRuleDTSTARTString appends a literal Z, so it must format UTC time,
    // and the string must be parsed back as UTC, not in the process timezone.
    const until = dayjs.utc("2026-01-15T12:34:56Z");
    const untilRule = `UNTIL=${until.toRRuleDTSTARTString()}`;
    const rule = `DTSTART:${dtstart.toRRuleDTSTARTString()}\nRRULE:FREQ=DAILY;COUNT=10;BYDAY=MO,WE,FR;${untilRule}`;
    const rrule = rrulestr(rule);
    const untilFormat = dayjs.DateFormat.RFC5545;
    const nextUntil = dayjs.utc(until.toRRuleDTSTARTString(), untilFormat);

    const rruleA = new RRule({
      dtstart: dtstart.toDate(),
      tzid: rrule.options.tzid,
      freq: RRule.DAILY, // DAILY
      count: 10,
      byweekday: [RRule.MO.weekday, RRule.WE.weekday, RRule.FR.weekday], // MO, WE, FR
      interval: 1,
      until: nextUntil.toDate(), // new until date
    });

    const rruleB = new RRule({
      dtstart: dtstart.toDate(),
      tzid: rrule.options.tzid,
      freq: RRule.DAILY, // DAILY
      count: 10,
      byweekday: [RRule.MO.weekday, RRule.WE.weekday, RRule.FR.weekday], // MO, WE, FR
      interval: 2,
      until: nextUntil.add(10, "minutes").toDate(), // new until date
    });

    const diffsA = diffRRuleOptions(rrule, rruleA);
    const diffsB = diffRRuleOptions(rrule, rruleB);

    expect(diffsA).toBeInstanceOf(Array);
    expect(diffsA).toHaveLength(0);

    expect(diffsB).toBeInstanceOf(Array);
    expect(diffsB).toHaveLength(2);

    expect(diffsB).toEqual(
      expect.arrayContaining([
        ["interval", 1],
        ["until", expect.any(Date)],
      ]),
    );
  });
});
