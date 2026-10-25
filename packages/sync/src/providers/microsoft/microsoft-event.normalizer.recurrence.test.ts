import { type DateTime } from "@core/types/domain-primitives";
import { type TimeZone } from "@core/types/type.utils";
import dayjs from "@core/util/date/dayjs";
import { projectOccurrences } from "@sync/domain/occurrence-projection";
import {
  type GraphEvent,
  normalizeMicrosoftEvent,
} from "@sync/providers/microsoft/microsoft-event.normalizer";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

const DENVER = "America/Denver" as TimeZone;

const OID = (date: string) => `OID.AAMkAGI2TG93AAA=.${date}`;

/** Real Graph shape: daily UTC series, explicit recurrence/original zones. */
const unwindUtcDailyMaster = (
  overrides: Partial<GraphEvent> = {},
): GraphEvent => ({
  id: "unwind-daily-utc",
  "@odata.etag": 'W/"unwind-daily-utc"',
  type: "seriesMaster",
  subject: "Unwind",
  start: {
    dateTime: "2025-10-20T01:00:00.0000000",
    timeZone: "UTC",
  },
  end: {
    dateTime: "2025-10-20T02:00:00.0000000",
    timeZone: "UTC",
  },
  originalStartTimeZone: "UTC",
  originalEndTimeZone: "UTC",
  recurrence: {
    pattern: { type: "daily", interval: 1 },
    range: {
      type: "noEnd",
      startDate: "2025-10-19",
      recurrenceTimeZone: "UTC",
    },
  },
  cancelledOccurrences: [
    OID("2025-10-21"),
    OID("2025-10-22"),
    OID("2025-10-23"),
    OID("2025-10-24"),
    OID("2025-10-25"),
    OID("2025-10-26"),
    OID("2025-10-28"),
    OID("2025-10-29"),
    OID("2025-10-30"),
    OID("2025-10-31"),
    OID("2025-11-04"),
    OID("2025-11-06"),
    OID("2025-11-07"),
  ],
  ...overrides,
});

const oct17DenverException = (): GraphEvent => ({
  id: "unwind-oct17-exception",
  "@odata.etag": 'W/"unwind-oct17-exception"',
  type: "exception",
  subject: "Unwind",
  seriesMasterId: "unwind-daily-utc",
  originalStart: "2025-10-18T01:00:00.0000000Z",
  originalStartTimeZone: "UTC",
  start: {
    dateTime: "2025-10-18T02:15:00.0000000",
    timeZone: "UTC",
  },
  end: {
    dateTime: "2025-10-18T03:00:00.0000000",
    timeZone: "UTC",
  },
});

const asSeriesMaster = (read: ReturnType<typeof normalizeMicrosoftEvent>) => {
  if (read.kind !== "event" || read.recurrence.kind !== "seriesMaster") {
    throw new Error("expected series master");
  }
  return read.recurrence;
};

const toMasterRecord = (
  read: Extract<ReturnType<typeof normalizeMicrosoftEvent>, { kind: "event" }>,
): EventRecord =>
  ({
    _id: "master-id",
    calendarId: "cal-id",
    connectionId: "conn-id",
    providerEventId: read.providerEventId,
    version: 1,
    content: {
      title: "Unwind",
      description: "",
      location: "",
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule: read.schedule,
    recurrence: asSeriesMaster(read),
  }) as EventRecord;

describe("normalizeMicrosoftEvent Microsoft recurring Unwind (UTC daily)", () => {
  it("keeps UTC when Graph declares UTC on the series and maps OID cancelledOccurrences to EXDATE", () => {
    const read = normalizeMicrosoftEvent(unwindUtcDailyMaster(), undefined, {
      graphPreferTimeZone: "UTC",
    });
    const master = asSeriesMaster(read);

    expect(read.schedule.kind).toBe("timed");
    if (read.schedule.kind !== "timed") return;
    expect(read.schedule.timeZone).toBe("UTC");
    expect(master.rules[0]).toContain("FREQ=DAILY");
    const exdates = master.rules.filter((line) => line.startsWith("EXDATE:"));
    expect(exdates).toHaveLength(13);
    expect(exdates).toContain("EXDATE:20251021T010000Z");
    expect(exdates).toContain("EXDATE:20251107T010000Z");
  });

  it("does not project occurrences on cancelled UTC dates", () => {
    const read = normalizeMicrosoftEvent(unwindUtcDailyMaster(), undefined, {
      graphPreferTimeZone: "UTC",
    });
    const master = toMasterRecord(read);
    const horizon = {
      start: new Date("2025-10-19T00:00:00.000Z"),
      end: new Date("2025-11-10T00:00:00.000Z"),
    };
    const starts = projectOccurrences(master, horizon).map((occ) =>
      dayjs(occ.startAt).utc().format("YYYY-MM-DD"),
    );
    expect(starts).not.toContain("2025-10-21");
    expect(starts).not.toContain("2025-10-24");
    expect(starts).not.toContain("2025-11-07");
    expect(starts).toContain("2025-10-20");
    expect(starts).toContain("2025-10-27");
  });

  it("renders edited Oct 17 occurrence at 8:15 PM Denver without duplicating the series slot", () => {
    const masterRead = normalizeMicrosoftEvent(
      unwindUtcDailyMaster(),
      undefined,
      {
        graphPreferTimeZone: "UTC",
      },
    );
    const exceptionRead = normalizeMicrosoftEvent(
      oct17DenverException(),
      undefined,
      {
        graphPreferTimeZone: "UTC",
      },
    );
    expect(exceptionRead.kind).toBe("event");
    if (exceptionRead.kind !== "event") return;
    expect(exceptionRead.schedule.kind).toBe("timed");
    if (exceptionRead.schedule.kind !== "timed") return;
    expect(
      dayjs(exceptionRead.schedule.start).tz(DENVER).format("MMM D h:mm A"),
    ).toBe("Oct 17 8:15 PM");

    const master = toMasterRecord(masterRead);
    const recurrenceId =
      exceptionRead.recurrence.kind === "instance"
        ? exceptionRead.recurrence.recurrenceId
        : null;
    expect(recurrenceId).toBeTruthy();

    const horizon = {
      start: new Date("2025-10-17T00:00:00.000Z"),
      end: new Date("2025-10-19T00:00:00.000Z"),
    };
    const masterOccs = projectOccurrences(master, horizon, [
      recurrenceId as DateTime,
    ]);
    expect(masterOccs.map((o) => o.startAt.toISOString())).not.toContain(
      "2025-10-18T01:00:00.000Z",
    );

    const exceptionRecord = {
      ...master,
      _id: "exception-id",
      providerEventId: exceptionRead.providerEventId,
      schedule: exceptionRead.schedule,
      recurrence: {
        kind: "exception" as const,
        seriesId: master._id,
        recurrenceId: recurrenceId as DateTime,
        cancelled: false,
      },
    } as EventRecord;
    const exceptionOccs = projectOccurrences(exceptionRecord, horizon);
    expect(exceptionOccs).toHaveLength(1);
    expect(
      dayjs(exceptionOccs[0]!.startAt).tz(DENVER).format("MMM D h:mm A"),
    ).toBe("Oct 17 8:15 PM");

    const merged = [...masterOccs, ...exceptionOccs].map((o) =>
      o.startAt.getTime(),
    );
    expect(new Set(merged).size).toBe(merged.length);
  });

  it("does not dedupe occurrences across two series masters with different ids", () => {
    const horizon = {
      start: new Date("2025-10-24T00:00:00.000Z"),
      end: new Date("2025-10-28T00:00:00.000Z"),
    };
    const first = normalizeMicrosoftEvent(
      unwindUtcDailyMaster({
        id: "series-a",
        cancelledOccurrences: [OID("2025-10-26")],
      }),
      undefined,
      { graphPreferTimeZone: "UTC" },
    );
    const second = normalizeMicrosoftEvent(
      unwindUtcDailyMaster({
        id: "series-b",
        iCalUId: "other-ical-uid",
        cancelledOccurrences: [OID("2025-10-25")],
      }),
      undefined,
      { graphPreferTimeZone: "UTC" },
    );
    const eventA = toMasterRecord(first);
    const eventB = toMasterRecord(second);

    const startsA = projectOccurrences(eventA, horizon).map((o) =>
      dayjs(o.startAt).utc().format("YYYY-MM-DD"),
    );
    const startsB = projectOccurrences(eventB, horizon).map((o) =>
      dayjs(o.startAt).utc().format("YYYY-MM-DD"),
    );

    expect(startsA).not.toContain("2025-10-26");
    expect(startsB).not.toContain("2025-10-25");
    expect(startsA).toContain("2025-10-25");
    expect(startsB).toContain("2025-10-26");
    expect(startsA.length).toBe(3);
    expect(startsB.length).toBe(3);

    const overlapDay = "2025-10-27";
    expect(startsA).toContain(overlapDay);
    expect(startsB).toContain(overlapDay);
    const aAt = projectOccurrences(eventA, horizon).find(
      (o) => dayjs(o.startAt).utc().format("YYYY-MM-DD") === overlapDay,
    )!;
    const bAt = projectOccurrences(eventB, horizon).find(
      (o) => dayjs(o.startAt).utc().format("YYYY-MM-DD") === overlapDay,
    )!;
    expect(aAt.startAt.getTime()).toBe(bAt.startAt.getTime());
  });
});
