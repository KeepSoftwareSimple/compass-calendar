import { type EventSchedule } from "@core/types/event.contracts";
import { type TimeZone } from "@core/types/type.utils";
import dayjs from "@core/util/date/dayjs";
import { projectOccurrences } from "@sync/domain/occurrence-projection";
import {
  type GraphEvent,
  normalizeMicrosoftEvent,
} from "@sync/providers/microsoft/microsoft-event.normalizer";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

const DENVER = "America/Denver" as TimeZone;
const UNWIND_BYDAY = "BYDAY=SU,TU,FR,SA";

type UnwindZoneFixture = {
  readonly label: string;
  readonly startEndTimeZone: "Mountain Standard Time" | "UTC";
  readonly recurrenceTimeZone?: string;
  readonly originalStartTimeZone?: string;
};

const unwindGraphEvent = ({
  startEndTimeZone,
  recurrenceTimeZone,
  originalStartTimeZone,
}: Omit<UnwindZoneFixture, "label">): GraphEvent => ({
  id: "unwind-series",
  "@odata.etag": 'W/"unwind"',
  type: "seriesMaster",
  subject: "Unwind",
  start: {
    dateTime: "2025-10-20T01:00:00.0000000",
    timeZone: startEndTimeZone,
  },
  end: {
    dateTime: "2025-10-20T02:00:00.0000000",
    timeZone: startEndTimeZone,
  },
  ...(originalStartTimeZone ? { originalStartTimeZone } : {}),
  recurrence: {
    pattern: {
      type: "weekly",
      interval: 1,
      daysOfWeek: ["sunday", "tuesday", "friday", "saturday"],
      firstDayOfWeek: "sunday",
    },
    range: {
      type: "noEnd",
      startDate: "2025-10-19",
      ...(recurrenceTimeZone ? { recurrenceTimeZone } : {}),
    },
  },
});

const asTimedSchedule = (read: ReturnType<typeof normalizeMicrosoftEvent>) => {
  if (read.kind !== "event") throw new Error("expected event");
  if (read.schedule.kind !== "timed") throw new Error("expected timed");
  return read.schedule;
};

const asSeriesMaster = (read: ReturnType<typeof normalizeMicrosoftEvent>) => {
  if (read.kind !== "event" || read.recurrence.kind !== "seriesMaster") {
    throw new Error("expected series master");
  }
  return read.recurrence;
};

const toEventRecord = (
  schedule: EventSchedule,
  rules: readonly string[],
): EventRecord =>
  ({
    _id: "event-id",
    calendarId: "cal-id",
    connectionId: "conn-id",
    providerEventId: "provider-id",
    version: 1,
    content: {
      title: "Unwind",
      description: "",
      location: "",
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule,
    recurrence: { kind: "seriesMaster", rules },
  }) as EventRecord;

const projectedLocalSlots = (
  event: EventRecord,
  horizonStart: string,
  horizonEnd: string,
) => {
  const horizon = {
    start: new Date(horizonStart),
    end: new Date(horizonEnd),
  };
  return projectOccurrences(event, horizon)
    .filter((occ) => occ.schedule.kind === "timed")
    .map((occ) => {
      const schedule = occ.schedule as Extract<
        EventSchedule,
        { kind: "timed" }
      >;
      const start = dayjs(schedule.start).tz(DENVER);
      return {
        day: start.format("ddd"),
        date: start.format("YYYY-MM-DD"),
        time: start.format("h:mm A"),
        offset: start.format("Z"),
      };
    });
};

describe("normalizeMicrosoftEvent Microsoft time zones", () => {
  const zoneFixtures: readonly UnwindZoneFixture[] = [
    {
      label: "Mountain Standard Time on start/end",
      startEndTimeZone: "Mountain Standard Time",
    },
    {
      label: "UTC start/end with recurrenceTimeZone",
      startEndTimeZone: "UTC",
      recurrenceTimeZone: "Mountain Standard Time",
    },
    {
      label: "UTC start/end with originalStartTimeZone only",
      startEndTimeZone: "UTC",
      originalStartTimeZone: "Mountain Standard Time",
    },
  ];

  it.each(zoneFixtures)(
    "maps Unwind ($label) to Denver wall time and weekly BYDAY",
    (fixture) => {
      const read = normalizeMicrosoftEvent(unwindGraphEvent(fixture));
      const schedule = asTimedSchedule(read);
      const recurrence = asSeriesMaster(read);

      expect(schedule.timeZone).toBe(DENVER);
      expect(schedule.start).toBe("2025-10-19T19:00:00-06:00");
      expect(schedule.end).toBe("2025-10-19T20:00:00-06:00");
      expect(recurrence.rules[0]).toContain("FREQ=WEEKLY");
      expect(recurrence.rules[0]).toContain(UNWIND_BYDAY);
    },
  );

  it("projects Sun/Tue/Fri/Sat at 7 PM Denver for the Oct 25 week", () => {
    const read = normalizeMicrosoftEvent(
      unwindGraphEvent({
        startEndTimeZone: "UTC",
        recurrenceTimeZone: "Mountain Standard Time",
      }),
    );
    const event = toEventRecord(read.schedule, asSeriesMaster(read).rules);
    const slots = projectedLocalSlots(
      event,
      "2025-10-25T06:00:00.000Z",
      "2025-11-01T06:00:00.000Z",
    );

    expect(slots).toEqual([
      { day: "Sat", date: "2025-10-25", time: "7:00 PM", offset: "-06:00" },
      { day: "Sun", date: "2025-10-26", time: "7:00 PM", offset: "-06:00" },
      { day: "Tue", date: "2025-10-28", time: "7:00 PM", offset: "-06:00" },
      { day: "Fri", date: "2025-10-31", time: "7:00 PM", offset: "-06:00" },
    ]);
  });

  it("keeps 7 PM local on the Denver fall-back week (Nov 1 DST end)", () => {
    const read = normalizeMicrosoftEvent(
      unwindGraphEvent({
        startEndTimeZone: "UTC",
        originalStartTimeZone: "Mountain Standard Time",
      }),
    );
    const event = toEventRecord(read.schedule, asSeriesMaster(read).rules);
    const slots = projectedLocalSlots(
      event,
      "2025-11-01T06:00:00.000Z",
      "2025-11-09T07:00:00.000Z",
    );

    expect(slots).toEqual([
      { day: "Sat", date: "2025-11-01", time: "7:00 PM", offset: "-06:00" },
      { day: "Sun", date: "2025-11-02", time: "7:00 PM", offset: "-07:00" },
      { day: "Tue", date: "2025-11-04", time: "7:00 PM", offset: "-07:00" },
      { day: "Fri", date: "2025-11-07", time: "7:00 PM", offset: "-07:00" },
      { day: "Sat", date: "2025-11-08", time: "7:00 PM", offset: "-07:00" },
    ]);
  });

  it("projects the same Denver slots when the host reports UTC", () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "UTC";

    try {
      const read = normalizeMicrosoftEvent(
        unwindGraphEvent({ startEndTimeZone: "Mountain Standard Time" }),
      );
      const event = toEventRecord(read.schedule, asSeriesMaster(read).rules);
      const slots = projectedLocalSlots(
        event,
        "2025-10-25T06:00:00.000Z",
        "2025-11-01T06:00:00.000Z",
      );

      expect(
        slots.map((slot) => `${slot.day} ${slot.date} ${slot.time}`),
      ).toEqual([
        "Sat 2025-10-25 7:00 PM",
        "Sun 2025-10-26 7:00 PM",
        "Tue 2025-10-28 7:00 PM",
        "Fri 2025-10-31 7:00 PM",
      ]);
    } finally {
      process.env.TZ = previousTz;
    }
  });
});
