import { faker } from "@faker-js/faker";
import { ObjectId } from "bson";
import { RRule } from "rrule";
import { recurring } from "@core/__mocks__/v1/events/gcal/gcal.recurring";
import { GCAL_MAX_RECURRENCES, Origin } from "@core/constants/core.constants";
import { gEventToCompassEvent } from "@core/mappers/map.event";
import { CalendarProvider } from "@core/types/calendar.types";
import { type BaseEvent } from "@core/types/compass-event.contracts";
import { type WithObjectId } from "@core/types/type.utils";
import dayjs from "@core/util/date/dayjs";
import { CompassEventRRule } from "@core/util/event/compass.event.rrule";
import {
  isBase,
  isInstance,
  parseCompassEventDate,
} from "@core/util/event/event.util";
import { isInstanceGCalEvent } from "@core/util/event/gcal.event.util";
import {
  createMockBaseEvent,
  generateCompassEventDates,
} from "@core/util/test/ccal.event.factory";

describe("CompassEventRRule: ", () => {
  it(`should return the correct number of events based on rrule count`, () => {
    const count = faker.number.int({
      min: 1,
      max: GCAL_MAX_RECURRENCES - 1,
    });
    const rruleString = `RRULE:FREQ=DAILY;COUNT=${count}`;

    const baseEvent = createMockBaseEvent({
      recurrence: { rule: [rruleString] },
    });

    const rrule = new CompassEventRRule({
      ...baseEvent,
      _id: new ObjectId(baseEvent._id),
    });

    expect(rrule.toString()).toContain("RRULE:FREQ=DAILY");
    expect(rrule.toString()).toContain(`COUNT=${count}`);
    expect(rrule.count()).toBe(count);
    expect(rrule.all()).toHaveLength(count);
  });

  it("should return the rrule in system timezone", () => {
    const baseEvent = createMockBaseEvent();
    const rrule = new CompassEventRRule({
      ...baseEvent,
      _id: new ObjectId(baseEvent._id),
    });
    const startDate = parseCompassEventDate(baseEvent.startDate!);
    const events = rrule.all();

    expect(rrule.options.dtstart.toISOString()).toEqual(
      startDate.toISOString(),
    );

    expect(events).toEqual(expect.arrayContaining([startDate.toDate()]));
  });

  it("should return the rrule without DTSTART and DTEND", () => {
    const baseEvent = createMockBaseEvent();
    const rrule = new CompassEventRRule({
      ...baseEvent,
      _id: new ObjectId(baseEvent._id),
    });

    expect(rrule.toString().includes("DTSTART")).toEqual(false);
    expect(rrule.toString().includes("DTEND")).toEqual(false);

    expect(
      rrule.toRecurrence().some((rule) => rule.includes("DTSTART")),
    ).toEqual(false);

    expect(rrule.toRecurrence().some((rule) => rule.includes("DTEND"))).toEqual(
      false,
    );
  });

  it("should include start dates outside the recurrence rule", () => {
    // Add an extra date outside the recurrence (e.g., a Friday)
    const startDateOnMonday = dayjs().startOf("week").add(1, "day");
    const startDate = startDateOnMonday.toISOString();
    const rule = [`RRULE:FREQ=WEEKLY;COUNT=0;BYDAY=${RRule.FR}`];
    const baseEvent = createMockBaseEvent({ startDate, recurrence: { rule } });
    const _id = new ObjectId(baseEvent._id);
    const rrule = new CompassEventRRule({ ...baseEvent, _id });

    const allDates = rrule.all();

    expect(allDates).toHaveLength(1);

    expect(allDates.some((d) => dayjs(d).isSame(startDateOnMonday))).toBe(true);
  });

  it("keeps the RRULE pattern when EXDATE lines are present", () => {
    // rrulestr returns an RRuleSet for multi-line input with EXDATE/RDATE,
    // whose origOptions is {} — without the RRULE-only filter the pattern
    // silently degraded to a default yearly rule.
    const rule = [
      "EXDATE;TZID=America/Chicago:20131023T110000",
      "RRULE:FREQ=WEEKLY;COUNT=5",
    ];
    const baseEvent = createMockBaseEvent({ recurrence: { rule } });
    const _id = new ObjectId(baseEvent._id);
    const rrule = new CompassEventRRule({ ...baseEvent, _id });

    expect(rrule.options.freq).toBe(RRule.WEEKLY.valueOf());
    expect(rrule.count()).toBe(5);
    expect(rrule.all()).toHaveLength(5);
  });

  it("should correctly merge options when multiple rrules are present", () => {
    const rule = [
      "RRULE:FREQ=DAILY;COUNT=2",
      "RRULE:FREQ=WEEKLY;COUNT=1;BYDAY=FR",
    ];
    const baseEvent = createMockBaseEvent({ recurrence: { rule } });
    const _id = new ObjectId(baseEvent._id);
    const rrule = new CompassEventRRule({ ...baseEvent, _id });

    // Should include both daily and weekly recurrences
    const allDates = rrule.all();
    expect(allDates.length).toBeGreaterThanOrEqual(2);

    // Options should merge both rules
    expect(rrule.options.freq).toBeDefined();
    expect(rrule.options.count).toBeDefined();
  });

  describe("diffOptions", () => {
    it("should return the differences between two rrule options", () => {
      const until = dayjs("2026-01-15T12:34:56Z");
      const untilRule = `UNTIL=${until.toRRuleDTSTARTString()}`;
      const rule = [`RRULE:FREQ=DAILY;COUNT=10;BYDAY=MO,WE,FR;${untilRule}`];
      const _baseEvent = createMockBaseEvent({ recurrence: { rule } });
      const _id = new ObjectId(_baseEvent._id);
      const baseEvent = { ..._baseEvent, _id };
      const rrule = new CompassEventRRule({ ...baseEvent, _id });
      const untilFormat = dayjs.DateFormat.RFC5545;
      const nextUntil = dayjs(until.toRRuleDTSTARTString(), untilFormat);

      const rruleA = new CompassEventRRule(
        { ...baseEvent, recurrence: { rule: [] } },
        {
          freq: RRule.DAILY, // DAILY
          count: 10,
          byweekday: [RRule.MO.weekday, RRule.WE.weekday, RRule.FR.weekday], // MO, WE, FR
          interval: 1,
          until: nextUntil.toDate(), // new until date
        },
      );

      const rruleB = new CompassEventRRule(
        { ...baseEvent, recurrence: { rule: [] } },
        {
          freq: RRule.DAILY, // DAILY
          count: 10,
          byweekday: [RRule.MO.weekday, RRule.WE.weekday, RRule.FR.weekday], // MO, WE, FR
          interval: 2,
          until: nextUntil.add(10, "minutes").toDate(), // new until date
        },
      );

      const diffsA = rrule.diffOptions(rruleA);
      const diffsB = rrule.diffOptions(rruleB);

      expect(diffsA).toBeInstanceOf(Array);
      expect(diffsA).toHaveLength(0);

      expect(diffsB).toBeInstanceOf(Array);
      expect(diffsB).toHaveLength(2);

      expect(diffsB).toEqual(
        expect.arrayContaining([
          ["interval", 2],
          ["until", expect.any(Date)],
        ]),
      );
    });
  });

  describe("toString", () => {
    it("should return the rrule string without DTSTART and DTEND", () => {
      const baseEvent = createMockBaseEvent();
      const _id = new ObjectId(baseEvent._id);
      const rrule = new CompassEventRRule({ ...baseEvent, _id });
      const rruleString = rrule.toString();

      expect(rruleString).toBeDefined();
      expect(rruleString).toContain("RRULE:");
      expect(rruleString.includes("DTSTART")).toEqual(false);
      expect(rruleString.includes("DTEND")).toEqual(false);
    });

    it("should round-trip UNTIL with a 'Z' suffix", () => {
      const until = dayjs().startOf("day").toRRuleDTSTARTString();
      const rule = [`RRULE:FREQ=DAILY;COUNT=10;UNTIL=${until}`];
      const baseEvent = createMockBaseEvent({ recurrence: { rule } });
      const _id = new ObjectId(baseEvent._id);
      const rrule = new CompassEventRRule({ ...baseEvent, _id });
      const rruleString = rrule.toString();
      const rruleOriginalString = rrule.toOriginalString();

      expect(rruleOriginalString).toBeDefined();
      expect(rruleOriginalString).toContain("RRULE:");

      expect(rruleString).toBeDefined();
      expect(rruleString).toContain("RRULE:");
      expect(rruleString).toContain(`UNTIL=${until}`);
    });

    it("should return the rrule string without COUNT if count is Max Count", () => {
      const rule = [
        `RRULE:FREQ=DAILY;COUNT=${GCAL_MAX_RECURRENCES};INTERVAL=2`,
      ];

      const baseEvent = createMockBaseEvent({ recurrence: { rule } });
      const _id = new ObjectId(baseEvent._id);
      const rrule = new CompassEventRRule({ ...baseEvent, _id });
      const rruleString = rrule.toString();

      expect(rruleString).toBeDefined();
      expect(rruleString).toContain("RRULE:");
      expect(rruleString.includes("DTSTART")).toEqual(false);
      expect(rruleString.includes("DTEND")).toEqual(false);
    });
  });

  describe("toRecurrence", () => {
    it("should return the recurrence string as an array", () => {
      const baseEvent = createMockBaseEvent();
      const _id = new ObjectId(baseEvent._id);
      const rrule = new CompassEventRRule({ ...baseEvent, _id });
      const recurrence = rrule.toRecurrence();

      expect(recurrence).toBeInstanceOf(Array);
      expect(recurrence.length).toBeGreaterThan(0);

      expect(recurrence.some((rule) => rule.startsWith("RRULE:"))).toEqual(
        true,
      );
    });
  });

  describe("base", () => {
    it("should return the recurrence string as an array", () => {
      const baseEvent = createMockBaseEvent();
      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });
      const recurrence = rrule.toRecurrence();

      expect(recurrence).toBeInstanceOf(Array);
      expect(recurrence.length).toBeGreaterThan(0);

      expect(recurrence.some((rule) => rule.startsWith("RRULE:"))).toEqual(
        true,
      );
    });

    it("should include the specified provider data in the generated base event", () => {
      const baseEvent = createMockBaseEvent();

      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });

      const base = rrule.base();

      expect(base.gEventId).not.toBeDefined();
      expect(base.gEventId).not.toBeNull();

      const providerBase = rrule.base(CalendarProvider.GOOGLE);

      expect(providerBase.gEventId).toEqual(baseEvent._id.toString());
    });
  });

  describe("instances", () => {
    it(`should return a maximum of ${GCAL_MAX_RECURRENCES} compass instances if no count is supplied in the recurrence`, () => {
      const rule = ["RRULE:FREQ=DAILY"];
      const baseEvent = createMockBaseEvent({ recurrence: { rule } });
      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });
      const instances = rrule.instances();

      expect(instances).toBeInstanceOf(Array);
      expect(instances).toHaveLength(GCAL_MAX_RECURRENCES);
    });

    it(`should return a maximum of ${GCAL_MAX_RECURRENCES} compass instances if count exceeds maximum recurrence`, () => {
      const rule = ["RRULE:FREQ=DAILY;COUNT=1000"];
      const baseEvent = createMockBaseEvent({ recurrence: { rule } });
      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });
      const instances = rrule.instances();

      expect(instances).toBeInstanceOf(Array);
      expect(instances).toHaveLength(GCAL_MAX_RECURRENCES);
    });

    it("should return the correct number of compass instances based on rrule count", () => {
      const count = faker.number.int({ min: 1, max: GCAL_MAX_RECURRENCES });
      const rule = [`RRULE:FREQ=DAILY;COUNT=${count}`];
      const baseEvent = createMockBaseEvent({ recurrence: { rule } });
      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });
      const instances = rrule.instances();

      expect(instances).toBeInstanceOf(Array);
      expect(instances).toHaveLength(count);
    });

    it("should return compass instances with the correct date format and timezone for an ALLDAY base event", () => {
      const rule = ["RRULE:FREQ=DAILY;COUNT=10"];
      const date = dayjs().startOf("year"); // specific date for testing
      const dates = generateCompassEventDates({ date, allDay: true });
      const baseEvent = createMockBaseEvent({ ...dates, recurrence: { rule } });
      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });
      const instances = rrule.instances();
      const startDate = parseCompassEventDate(baseEvent.startDate!);
      const endDate = parseCompassEventDate(baseEvent.endDate!);
      const dateFormat = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

      instances.forEach((instance, index) => {
        expect(instance.startDate).toBeDefined();
        expect(instance.endDate).toBeDefined();

        expect(instance.startDate).toEqual(
          startDate.add(index, "day").format(dateFormat),
        );

        expect(instance.endDate).toEqual(
          endDate.add(index, "day").format(dateFormat),
        );
      });
    });

    it("should return compass instances with the correct date format and timezone for a TIMED base event", () => {
      const rule = ["RRULE:FREQ=DAILY;COUNT=10"];
      const date = dayjs().startOf("year"); // specific date for testing
      const dates = generateCompassEventDates({ date });
      const baseEvent = createMockBaseEvent({ ...dates, recurrence: { rule } });
      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });
      const instances = rrule.instances();
      const startDate = parseCompassEventDate(baseEvent.startDate!);
      const endDate = parseCompassEventDate(baseEvent.endDate!);
      const dateFormat = dayjs.DateFormat.RFC3339_OFFSET;

      instances.forEach((instance, index) => {
        expect(instance.startDate).toBeDefined();
        expect(instance.endDate).toBeDefined();

        expect(instance.startDate).toEqual(
          startDate.add(index, "day").format(dateFormat),
        );

        expect(instance.endDate).toEqual(
          endDate.add(index, "day").format(dateFormat),
        );
      });
    });

    it("should include the specified provider data in the generated instance events", () => {
      const rule = ["RRULE:FREQ=DAILY;COUNT=2"];
      const date = dayjs().startOf("year"); // specific date for testing
      const dates = generateCompassEventDates({ date });
      const baseEvent = createMockBaseEvent({ ...dates, recurrence: { rule } });

      const rrule = new CompassEventRRule({
        ...baseEvent,
        _id: new ObjectId(baseEvent._id),
      });

      const instances = rrule.instances();
      const providerInstances = rrule.instances(CalendarProvider.GOOGLE);

      instances.forEach((instance) => {
        expect(instance._id).toBeDefined();
        expect(instance.gEventId).not.toBeDefined();
        expect(instance.gEventId).not.toBeNull();
        expect(instance.gRecurringEventId).not.toBeDefined();
        expect(instance.gRecurringEventId).not.toBeNull();
      });

      providerInstances.forEach((instance) => {
        expect(instance._id).toBeDefined();
        expect(instance.gEventId).toBeDefined();
        expect(instance.gRecurringEventId).toBeDefined();
      });
    });

    it("should have times and timezones that match a real gcal event", () => {
      const baseCompassId = new ObjectId();

      const compassEvents = recurring.map((gEvent) => {
        const isInstance = isInstanceGCalEvent(gEvent);
        const _id = isInstance ? new ObjectId() : baseCompassId;

        const event = {
          ...gEventToCompassEvent(gEvent, "test-user", Origin.GOOGLE_IMPORT),
          _id,
        };

        if (isInstance) {
          event.recurrence = { eventId: baseCompassId.toString() };
        }

        return event;
      });

      const baseEvent = compassEvents.find(isBase) as WithObjectId<
        Omit<BaseEvent, "_id">
      >;

      expect(baseEvent).toBeDefined();
      expect(baseEvent).not.toBeNull();

      const rrule = new CompassEventRRule(baseEvent);
      const compassInstances = compassEvents.filter(isInstance);
      const instances = rrule.instances(CalendarProvider.GOOGLE);

      instances.forEach((instance, index) => {
        const compassInstance = compassInstances[index];

        expect(compassInstance).toBeDefined();
        expect(compassInstance).not.toBeNull();

        expect(instance.startDate).toBeDefined();
        expect(instance.startDate).not.toBeNull();
        expect(instance.endDate).toBeDefined();
        expect(instance.endDate).not.toBeNull();

        const startDate = parseCompassEventDate(instance.startDate!);
        const endDate = parseCompassEventDate(instance.endDate!);
        const cStartDate = parseCompassEventDate(compassInstance!.startDate);
        const cEndDate = parseCompassEventDate(compassInstance!.endDate);

        expect(startDate.isSame(cStartDate)).toBe(true);
        expect(endDate.isSame(cEndDate)).toBe(true);
      });
    });
  });

  // The whole suite runs under TZ=Etc/UTC (packages/scripts/src/testing/
  // test-parallel.ts), where the timezone-shift bug below is invisible - a
  // Denver event's expansion frame and the host's happen to coincide. The
  // `tzid` option exists so these tests can pin a non-UTC expansion frame
  // independently of the host, without changing process.env.TZ.
  describe("non-UTC expansion (America/Denver, tzid injection)", () => {
    const denver = "America/Denver";
    // A real Thursday; both real Thursday, MDT.
    const thursday = "2026-07-23T19:00:00-06:00";
    const endOfThursday = "2026-07-23T20:00:00-06:00";

    it("expands BYDAY=SA onto Saturday, not the previous local day", () => {
      const rule = ["RRULE:FREQ=WEEKLY;BYDAY=SA"];
      const baseEvent = createMockBaseEvent(
        { startDate: thursday, recurrence: { rule } },
        false,
        { value: 1, unit: "hours" },
      );
      const rrule = new CompassEventRRule(
        { ...baseEvent, _id: new ObjectId(baseEvent._id) },
        { tzid: denver },
      );

      const labeled = rrule
        .all((_, index) => index < 1)
        .map((d) => dayjs(d).tz(denver).format("dddd HH:mm"));

      expect(labeled).toContain("Saturday 19:00");
      expect(labeled).not.toContain("Friday 19:00");
    });

    it("expands BYDAY=FR onto Friday instead of silently reusing the draft's own day", () => {
      const rule = ["RRULE:FREQ=WEEKLY;BYDAY=FR"];
      const baseEvent = createMockBaseEvent(
        { startDate: thursday, recurrence: { rule } },
        false,
        { value: 1, unit: "hours" },
      );
      const rrule = new CompassEventRRule(
        { ...baseEvent, _id: new ObjectId(baseEvent._id) },
        { tzid: denver },
      );

      const labeled = rrule
        .all((_, index) => index < 1)
        .map((d) => dayjs(d).tz(denver).format("dddd HH:mm"));

      expect(labeled).toContain("Friday 19:00");
    });

    it("round-trips a rule with a real-UTC UNTIL byte-identically", () => {
      const until = dayjs
        .tz("2027-05-31 19:00", denver)
        .utc()
        .format("YYYYMMDD[T]HHmmss[Z]");
      const rule = [`RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=${until}`];
      const baseEvent = createMockBaseEvent(
        { startDate: thursday, recurrence: { rule } },
        false,
        { value: 1, unit: "hours" },
      );
      const rrule = new CompassEventRRule(
        { ...baseEvent, _id: new ObjectId(baseEvent._id) },
        { tzid: denver },
      );

      expect(rrule.toRecurrence()).toEqual(rule);
    });

    it("until returns the real instant, not the internal floating stand-in", () => {
      const until = dayjs
        .tz("2027-05-31 19:00", denver)
        .utc()
        .format("YYYYMMDD[T]HHmmss[Z]");
      const rule = [`RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=${until}`];
      const baseEvent = createMockBaseEvent(
        { startDate: thursday, recurrence: { rule } },
        false,
        { value: 1, unit: "hours" },
      );
      const rrule = new CompassEventRRule(
        { ...baseEvent, _id: new ObjectId(baseEvent._id) },
        { tzid: denver },
      );

      expect(rrule.until).not.toBeNull();
      expect(dayjs(rrule.until).utc().format("YYYYMMDD[T]HHmmss[Z]")).toEqual(
        until,
      );
      // Feeding it straight back into `_options.until` (as useRecurrence
      // does every render) must not float it a second time - the round trip
      // that used to double-float and never converge, exercised end-to-end
      // in useRecurrence.test.ts's "real setDraft feedback loop" case.
      const rebuilt = new CompassEventRRule(
        {
          ...baseEvent,
          _id: new ObjectId(baseEvent._id),
          recurrence: { rule: [] },
        },
        { ...rrule.options, until: rrule.until, tzid: denver },
      );
      expect(rebuilt.until?.toISOString()).toEqual(rrule.until?.toISOString());
    });

    it("until is null when the rule has no UNTIL", () => {
      const rule = ["RRULE:FREQ=WEEKLY;BYDAY=SA"];
      const baseEvent = createMockBaseEvent(
        { startDate: thursday, recurrence: { rule } },
        false,
        { value: 1, unit: "hours" },
      );
      const rrule = new CompassEventRRule(
        { ...baseEvent, _id: new ObjectId(baseEvent._id) },
        { tzid: denver },
      );

      expect(rrule.until).toBeNull();
    });

    it("until returns an all-day UNTIL unmodified (never floated)", () => {
      const date = dayjs.tz("2027-05-31", denver);
      const dates = generateCompassEventDates({ date, allDay: true });
      const rule = ["RRULE:FREQ=DAILY;UNTIL=20270615"];
      const baseEvent = createMockBaseEvent({ ...dates, recurrence: { rule } });
      const rrule = new CompassEventRRule(
        { ...baseEvent, _id: new ObjectId(baseEvent._id) },
        { tzid: denver },
      );

      expect(rrule.until).toEqual(rrule.options.until);
    });

    it("keeps the wall-clock time across the DST fallback boundary", () => {
      const rule = ["RRULE:FREQ=WEEKLY;BYDAY=TH;COUNT=20"];
      const baseEvent = createMockBaseEvent(
        { startDate: thursday, recurrence: { rule } },
        false,
        { value: 1, unit: "hours" },
      );
      const rrule = new CompassEventRRule(
        { ...baseEvent, _id: new ObjectId(baseEvent._id) },
        { tzid: denver },
      );

      const dates = rrule.all();
      const beforeFallback = dates.find(
        (d) => dayjs(d).tz(denver).format("YYYY-MM-DD") === "2026-10-29",
      );
      const afterFallback = dates.find(
        (d) => dayjs(d).tz(denver).format("YYYY-MM-DD") === "2026-11-05",
      );

      expect(beforeFallback).toBeDefined();
      expect(afterFallback).toBeDefined();
      expect(dayjs(beforeFallback).tz(denver).format("HH:mm Z")).toEqual(
        "19:00 -06:00",
      );
      expect(dayjs(afterFallback).tz(denver).format("HH:mm Z")).toEqual(
        "19:00 -07:00",
      );
    });
  });
});
