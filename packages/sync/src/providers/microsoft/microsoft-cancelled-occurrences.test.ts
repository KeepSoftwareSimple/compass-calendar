import { rruleVectorInput } from "@core/test/rrule.vectors.data";
import { type EventSchedule } from "@core/types/event.contracts";
import { type TimeZone } from "@core/types/type.utils";
import dayjs from "@core/util/date/dayjs";
import { projectOccurrences } from "@sync/domain/occurrence-projection";
import {
  type CancelledOccurrenceMasterContext,
  cancelledOccurrencesToExdateRules,
} from "@sync/providers/microsoft/microsoft-cancelled-occurrences";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

const DENVER = "America/Denver" as TimeZone;

const utcDailySchedule: EventSchedule = {
  kind: "timed",
  start: "2025-10-20T01:00:00.000Z",
  end: "2025-10-20T02:00:00.000Z",
  timeZone: "UTC",
};

const utcMaster = (
  overrides: Partial<CancelledOccurrenceMasterContext> = {},
): CancelledOccurrenceMasterContext => ({
  start: {
    dateTime: "2025-10-20T01:00:00.0000000",
    timeZone: "UTC",
  },
  originalStartTimeZone: "UTC",
  recurrence: {
    range: { recurrenceTimeZone: "UTC" },
  },
  ...overrides,
});

const denverUnwindSchedule: EventSchedule = {
  kind: "timed",
  start: "2025-10-19T19:00:00-06:00",
  end: "2025-10-19T20:00:00-06:00",
  timeZone: DENVER,
};

const denverUnwindMasterUtcFields = (
  overrides: Partial<CancelledOccurrenceMasterContext> = {},
): CancelledOccurrenceMasterContext => ({
  start: {
    dateTime: "2025-10-20T01:00:00.0000000",
    timeZone: "UTC",
  },
  originalStartTimeZone: "Mountain Standard Time",
  recurrence: {
    range: { recurrenceTimeZone: "Mountain Standard Time" },
  },
  ...overrides,
});

describe("cancelledOccurrencesToExdateRules", () => {
  it("maps OID.<id>.<yyyy-mm-dd> to EXDATE at master clock in recurrence zone (UTC)", () => {
    const rules = cancelledOccurrencesToExdateRules(
      ["OID.AAMkAGI2TG93AAA=.2025-10-21"],
      utcMaster(),
      utcDailySchedule,
    );
    expect(rules).toEqual(["EXDATE:20251021T010000Z"]);
  });

  it("maps each cancelled series date independently", () => {
    const entries = [
      "OID.series-one.2025-10-21",
      "OID.series-one.2025-10-23",
      "OID.series-one.2025-11-04",
    ];
    const rules = cancelledOccurrencesToExdateRules(
      entries,
      utcMaster(),
      utcDailySchedule,
    );
    expect(rules).toHaveLength(3);
    expect(rules).toContain("EXDATE:20251021T010000Z");
    expect(rules).toContain("EXDATE:20251023T010000Z");
    expect(rules).toContain("EXDATE:20251104T010000Z");
  });

  it("uses recurrenceTimeZone when start fields are UTC", () => {
    const rules = cancelledOccurrencesToExdateRules(
      ["OID.x.2025-10-21"],
      utcMaster({
        recurrence: { range: { recurrenceTimeZone: "UTC" } },
        originalStartTimeZone: "UTC",
      }),
      utcDailySchedule,
    );
    const instant = dayjs.utc("2025-10-21T01:00:00Z");
    expect(rules[0]).toBe(`EXDATE:${instant.format("YYYYMMDD[T]HHmmss[Z]")}`);
  });

  it("still accepts legacy ISO instant strings", () => {
    const rules = cancelledOccurrencesToExdateRules(
      ["2025-10-21T01:00:00.0000000Z"],
      utcMaster(),
      utcDailySchedule,
    );
    expect(rules).toEqual(["EXDATE:20251021T010000Z"]);
  });

  it("uses 7 PM Denver wall clock when Graph start is UTC (production Unwind shape)", () => {
    const rules = cancelledOccurrencesToExdateRules(
      ["OID.series.2026-10-04", "OID.series.2026-10-16"],
      denverUnwindMasterUtcFields(),
      denverUnwindSchedule,
    );
    expect(rules).toEqual([
      "EXDATE;TZID=America/Denver:20261004T190000",
      "EXDATE;TZID=America/Denver:20261016T190000",
    ]);
  });

  it("keeps local EXDATE date when the occurrence instant is on the next UTC day", () => {
    const rules = cancelledOccurrencesToExdateRules(
      ["OID.series.2025-10-04"],
      denverUnwindMasterUtcFields(),
      denverUnwindSchedule,
    );
    expect(rules).toEqual(["EXDATE;TZID=America/Denver:20251004T190000"]);
    const instant = dayjs.tz("2025-10-04T19:00:00", DENVER);
    expect(dayjs.utc(instant).format("YYYY-MM-DD")).toBe("2025-10-05");
  });

  it("keeps 7 PM local after Denver fall-back (DST)", () => {
    const vector = rruleVectorInput("weekly-byday-sa-denver");
    const schedule: EventSchedule = {
      kind: "timed",
      start: vector.startDate,
      end: vector.endDate,
      timeZone: DENVER,
    };
    const master: CancelledOccurrenceMasterContext = {
      start: {
        dateTime: "2025-11-02T01:00:00.0000000",
        timeZone: "UTC",
      },
      recurrence: {
        range: { recurrenceTimeZone: "Mountain Standard Time" },
      },
    };
    const rules = cancelledOccurrencesToExdateRules(
      ["OID.series.2025-11-08"],
      master,
      schedule,
    );
    expect(rules).toEqual(["EXDATE;TZID=America/Denver:20251108T190000"]);
    expect(dayjs.tz("2025-11-08T19:00:00", DENVER).format("Z")).toBe("-07:00");
  });

  it("EXDATE suppresses cancelled Denver occurrences in projection", () => {
    const vector = rruleVectorInput("weekly-byday-sa-denver");
    const schedule: EventSchedule = {
      kind: "timed",
      start: vector.startDate,
      end: vector.endDate,
      timeZone: DENVER,
    };
    const exdates = cancelledOccurrencesToExdateRules(
      ["OID.series.2026-08-01"],
      denverUnwindMasterUtcFields(),
      schedule,
    );
    const event = {
      _id: "master",
      calendarId: "cal",
      connectionId: "conn",
      providerEventId: "p",
      version: 1,
      content: {
        title: "t",
        description: "",
        location: "",
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule,
      recurrence: {
        kind: "seriesMaster" as const,
        rules: [vector.recurrenceRule, ...exdates],
      },
    } as EventRecord;
    const horizon = {
      start: new Date("2026-07-25T06:00:00.000Z"),
      end: new Date("2026-08-03T06:00:00.000Z"),
    };
    const dates = projectOccurrences(event, horizon).map((occ) =>
      dayjs(occ.startAt).tz(DENVER).format("YYYY-MM-DD"),
    );
    expect(dates).not.toContain("2026-08-01");
    expect(dates).toContain("2026-07-25");
  });
});
