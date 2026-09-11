import { faker } from "@faker-js/faker";
import {
  type CalendarId,
  type DateOnly,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type EventSchedule } from "@core/types/event.contracts";
import {
  type OccurrenceKey,
  type SyncEventRecurrence,
} from "@core/types/sync/event.contracts";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  occurrenceScheduleAfterSeriesEdit,
  type ProjectionHorizon,
  projectOccurrences,
  truncateRulesBefore,
} from "@sync/domain/occurrence-projection";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

const objectId = () => faker.database.mongodbObjectId();

// A wide horizon so most cases aren't clipped; individual tests narrow it.
const HORIZON: ProjectionHorizon = {
  start: new Date("2026-01-01T00:00:00.000Z"),
  end: new Date("2027-07-01T00:00:00.000Z"),
};

const timed = (start: string, end: string, timeZone = "America/Denver") =>
  ({
    kind: "timed",
    start: start as DateTime,
    end: end as DateTime,
    timeZone,
  }) as EventSchedule;

const allDay = (start: string, end: string) =>
  ({
    kind: "allDay",
    start: start as DateOnly,
    end: end as DateOnly,
  }) as EventSchedule;

const event = (
  schedule: EventSchedule,
  recurrence: SyncEventRecurrence,
  overrides: Partial<EventRecord> = {},
): EventRecord =>
  ({
    _id: objectId() as EventId,
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    origin: "compass",
    calendarId: objectId() as CalendarId,
    clientEventId: null,
    connectionId: null,
    providerEventId: null,
    providerVersion: null,
    providerUpdatedAt: null,
    deliveryState: null,
    providerMetadata: null,
    content: {
      title: "Standup",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule,
    recurrence,
    lifecycleState: "active",
    generation: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    confirmedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }) as EventRecord;

describe("projectOccurrences", () => {
  describe("single events", () => {
    it("projects one occurrence for a timed single event in range", () => {
      const e = event(
        timed("2026-07-14T09:00:00-06:00", "2026-07-14T10:00:00-06:00"),
        { kind: "single" },
      );
      const [occ, ...rest] = projectOccurrences(e, HORIZON);
      expect(rest).toHaveLength(0);
      expect(occ).toMatchObject({
        eventId: e._id,
        calendarId: e.calendarId,
        title: "Standup",
        busy: true,
        cancelled: false,
        generation: 0,
      });
      expect(occ?.startAt.toISOString()).toBe("2026-07-14T15:00:00.000Z");
      // Half-open end: the timed end instant.
      expect(occ?.endAt?.toISOString()).toBe("2026-07-14T16:00:00.000Z");
      expect(occ?.occurrenceKey).toBe(
        `${e._id}:2026-07-14T15:00:00.000Z` as OccurrenceKey,
      );
    });

    it("projects one occurrence for an all-day single event", () => {
      const e = event(allDay("2026-07-14", "2026-07-15"), { kind: "single" });
      const [occ] = projectOccurrences(e, HORIZON);
      expect(occ?.schedule).toEqual(allDay("2026-07-14", "2026-07-15"));
      expect(occ?.startAt.toISOString()).toBe("2026-07-14T00:00:00.000Z");
      // The all-day end date is exclusive, so endAt is midnight UTC of it.
      expect(occ?.endAt?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    });

    it("omits a single event whose start is before the horizon", () => {
      const e = event(
        timed("2025-06-01T09:00:00-06:00", "2025-06-01T10:00:00-06:00"),
        { kind: "single" },
      );
      expect(projectOccurrences(e, HORIZON)).toHaveLength(0);
    });

    it("omits a single event whose start is at or after the horizon end", () => {
      const e = event(
        timed("2027-07-01T00:00:00+00:00", "2027-07-01T01:00:00+00:00"),
        { kind: "single" },
      );
      expect(projectOccurrences(e, HORIZON)).toHaveLength(0);
    });

    it("marks a transparent provider event as not busy", () => {
      const e = event(
        timed("2026-07-14T09:00:00-06:00", "2026-07-14T10:00:00-06:00"),
        { kind: "single" },
        { providerMetadata: { transparency: "transparent" } },
      );
      const [occ] = projectOccurrences(e, HORIZON);
      expect(occ?.busy).toBe(false);
    });

    it("marks null providerMetadata as busy", () => {
      const e = event(
        timed("2026-07-14T09:00:00-06:00", "2026-07-14T10:00:00-06:00"),
        { kind: "single" },
        { providerMetadata: null },
      );
      const [occ] = projectOccurrences(e, HORIZON);
      expect(occ?.busy).toBe(true);
    });

    it("marks an opaque correlated import as busy when metadata has only iCalUID", () => {
      const e = event(
        timed("2026-07-14T09:00:00-06:00", "2026-07-14T10:00:00-06:00"),
        { kind: "single" },
        { providerMetadata: { iCalUID: "opaque@google.com" } },
      );
      const [occ] = projectOccurrences(e, HORIZON);
      expect(occ?.busy).toBe(true);
    });
  });

  describe("exceptions", () => {
    it("projects an active exception as one occurrence", () => {
      const e = event(
        timed("2026-07-14T11:00:00-06:00", "2026-07-14T12:00:00-06:00"),
        {
          kind: "exception",
          seriesId: objectId() as EventRecord["_id"],
          recurrenceId: "2026-07-14T09:00:00-06:00" as never,
          cancelled: false,
        },
      );
      const [occ] = projectOccurrences(e, HORIZON);
      expect(occ?.cancelled).toBe(false);
      expect(occ?.startAt.toISOString()).toBe("2026-07-14T17:00:00.000Z");
    });

    it("projects a cancelled exception as a cancelled occurrence", () => {
      const e = event(
        timed("2026-07-14T09:00:00-06:00", "2026-07-14T10:00:00-06:00"),
        {
          kind: "exception",
          seriesId: objectId() as EventRecord["_id"],
          recurrenceId: "2026-07-14T09:00:00-06:00" as never,
          cancelled: true,
        },
      );
      const [occ, ...rest] = projectOccurrences(e, HORIZON);
      expect(rest).toHaveLength(0);
      expect(occ?.cancelled).toBe(true);
    });
  });

  describe("series masters", () => {
    it("expands a weekly series and preserves duration", () => {
      const e = event(
        timed("2026-07-06T09:00:00-06:00", "2026-07-06T09:30:00-06:00"),
        { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] },
      );
      const occ = projectOccurrences(e, HORIZON);
      expect(occ.map((o) => o.startAt.toISOString())).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-13T15:00:00.000Z",
        "2026-07-20T15:00:00.000Z",
      ]);
      for (const o of occ) {
        if (o.schedule.kind !== "timed") throw new Error("expected timed");
        const durationMs =
          new Date(o.schedule.end).getTime() -
          new Date(o.schedule.start).getTime();
        expect(durationMs).toBe(30 * 60 * 1000);
        // endAt tracks the shifted duration on the normalized axis too.
        expect(o.endAt?.getTime()).toBe(o.startAt.getTime() + 30 * 60 * 1000);
      }
    });

    it("keeps DTSTART when BYDAY would otherwise skip the series start day", () => {
      // Staging repro: Friday start + weekly BYDAY=SU (default week-start
      // constant). Pure RRULE expansion jumps to Sunday; the create week's
      // range read must still see Friday so the SPA grid is not empty.
      const e = event(
        timed("2026-07-24T12:00:00-06:00", "2026-07-24T13:00:00-06:00"),
        {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=WEEKLY;COUNT=12;INTERVAL=1;BYDAY=SU"],
        },
      );
      const occ = projectOccurrences(e, HORIZON);
      expect(occ[0]?.startAt.toISOString()).toBe("2026-07-24T18:00:00.000Z");
      expect(occ.map((o) => o.startAt.toISOString()).slice(0, 3)).toEqual([
        "2026-07-24T18:00:00.000Z",
        "2026-07-26T18:00:00.000Z",
        "2026-08-02T18:00:00.000Z",
      ]);
    });

    it("clamps expansion to the horizon window", () => {
      const e = event(
        timed("2026-01-01T09:00:00-07:00", "2026-01-01T10:00:00-07:00"),
        { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
      );
      const narrow: ProjectionHorizon = {
        start: new Date("2026-06-01T00:00:00.000Z"),
        end: new Date("2026-07-01T00:00:00.000Z"),
      };
      const occ = projectOccurrences(e, narrow);
      expect(occ.length).toBeGreaterThan(0);
      for (const o of occ) {
        expect(o.startAt.getTime()).toBeGreaterThanOrEqual(
          narrow.start.getTime(),
        );
        expect(o.startAt.getTime()).toBeLessThan(narrow.end.getTime());
      }
    });

    it("skips instants owned by an exception", () => {
      const e = event(
        timed("2026-07-06T09:00:00-06:00", "2026-07-06T10:00:00-06:00"),
        { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] },
      );
      // The second occurrence (2026-07-13T09:00-06:00) is excepted.
      const occ = projectOccurrences(e, HORIZON, [
        "2026-07-13T09:00:00-06:00" as never,
      ]);
      expect(occ.map((o) => o.startAt.toISOString())).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-20T15:00:00.000Z",
      ]);
    });

    it("expands an all-day weekly series preserving the multi-day span", () => {
      const e = event(allDay("2026-07-06", "2026-07-08"), {
        kind: "seriesMaster",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=2"],
      });
      const occ = projectOccurrences(e, HORIZON);
      expect(occ.map((o) => o.schedule)).toEqual([
        allDay("2026-07-06", "2026-07-08"),
        allDay("2026-07-13", "2026-07-15"),
      ]);
    });

    it("keeps wall-clock time across a DST spring-forward transition", () => {
      // US DST 2026 begins 2026-03-08. A weekly 09:00 Denver series should read
      // 09:00 local on both sides, with the civil offset changing -07 -> -06.
      const e = event(
        timed("2026-03-01T09:00:00-07:00", "2026-03-01T10:00:00-07:00"),
        { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] },
      );
      const occ = projectOccurrences(e, HORIZON);
      const starts = occ.map((o) =>
        o.schedule.kind === "timed" ? o.schedule.start : ("" as DateTime),
      );
      expect(starts).toEqual([
        "2026-03-01T09:00:00-07:00" as DateTime,
        "2026-03-08T09:00:00-06:00" as DateTime,
        "2026-03-15T09:00:00-06:00" as DateTime,
      ]);
    });

    it("bounds a non-ending daily rule to the horizon rather than expanding forever", () => {
      const e = event(
        timed("2026-06-01T09:00:00-06:00", "2026-06-01T09:15:00-06:00"),
        { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
      );
      const narrow: ProjectionHorizon = {
        start: new Date("2026-06-01T00:00:00.000Z"),
        end: new Date("2026-06-11T00:00:00.000Z"),
      };
      const occ = projectOccurrences(e, narrow);
      expect(occ).toHaveLength(10);
    });

    it("honors a UTC UNTIL west of UTC without a phantom trailing occurrence", () => {
      // Google encodes "ends June 9 (America/Denver)" as UNTIL=20260610T055959Z.
      // A real-UTC UNTIL compared against floating candidates would leak one
      // extra occurrence on June 10; the boundary must land on June 9.
      const e = event(
        timed("2026-06-01T03:00:00-06:00", "2026-06-01T03:15:00-06:00"),
        {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=DAILY;UNTIL=20260610T055959Z"],
        },
      );
      const starts = projectOccurrences(e, HORIZON).map((o) =>
        o.startAt.toISOString(),
      );
      expect(starts).toHaveLength(9);
      expect(starts.at(-1)).toBe("2026-06-09T09:00:00.000Z");
    });

    it("honors a UTC UNTIL east of UTC without dropping the final occurrence", () => {
      // "ends June 5 (Asia/Kolkata, +05:30)" is UNTIL=20260605T182959Z. A
      // real-UTC UNTIL would drop the true June 5 occurrence (20:00 IST is
      // 14:30Z, past the naive 18:29:59 boundary in the floating frame).
      const e = event(
        timed(
          "2026-06-01T20:00:00+05:30",
          "2026-06-01T20:30:00+05:30",
          "Asia/Kolkata",
        ),
        {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=DAILY;UNTIL=20260605T182959Z"],
        },
      );
      const starts = projectOccurrences(e, HORIZON).map((o) =>
        o.startAt.toISOString(),
      );
      expect(starts).toHaveLength(5);
      expect(starts.at(-1)).toBe("2026-06-05T14:30:00.000Z");
    });
  });

  describe("series masters with EXDATE/RDATE", () => {
    // Multi-line rules used to flip rrulestr onto its RRuleSet branch, which
    // ignores the dtstart option — the series re-anchored at "now" on every
    // projection (dead series resurrected into the present, EXDATEs ignored,
    // per-instance delete tombstones orphaned by shifting occurrenceKeys).

    // A weekly Denver 09:00 series starting Mon 2026-07-06 (15:00Z), 30 min.
    const weekly = (rules: string[]) =>
      event(timed("2026-07-06T09:00:00-06:00", "2026-07-06T09:30:00-06:00"), {
        kind: "seriesMaster",
        rules,
      });
    const starts = (e: EventRecord) =>
      projectOccurrences(e, HORIZON).map((o) => o.startAt.toISOString());

    it("excludes an EXDATE instant stated in the event's own zone", () => {
      const e = weekly([
        "EXDATE;TZID=America/Denver:20260713T090000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]);
      expect(starts(e)).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-20T15:00:00.000Z",
      ]);
    });

    it("excludes an EXDATE instant stated in a different zone", () => {
      // 10:00 Chicago (CDT, -05:00) is the same instant as 09:00 Denver.
      const e = weekly([
        "EXDATE;TZID=America/Chicago:20260713T100000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]);
      expect(starts(e)).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-20T15:00:00.000Z",
      ]);
    });

    it("excludes every value of a comma-separated EXDATE list", () => {
      const e = weekly([
        "EXDATE;TZID=America/Denver:20260713T090000,20260720T090000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]);
      expect(starts(e)).toEqual(["2026-07-06T15:00:00.000Z"]);
    });

    it("excludes an EXDATE;VALUE=DATE instance of an all-day series", () => {
      const e = event(allDay("2026-03-10", "2026-03-11"), {
        kind: "seriesMaster",
        rules: ["EXDATE;VALUE=DATE:20270310", "RRULE:FREQ=YEARLY;COUNT=2"],
      });
      expect(starts(e)).toEqual(["2026-03-10T00:00:00.000Z"]);
    });

    it("suppresses the DTSTART special-case instance when EXDATE names it", () => {
      const e = weekly([
        "EXDATE;TZID=America/Denver:20260706T090000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]);
      expect(starts(e)).toEqual([
        "2026-07-13T15:00:00.000Z",
        "2026-07-20T15:00:00.000Z",
      ]);
    });

    it("adds an RDATE instant with the master's duration and zone", () => {
      // 11:00 Sydney (AEST, +10:00) on July 15 = 2026-07-15T01:00:00Z.
      const e = weekly([
        "RDATE;TZID=Australia/Sydney:20260715T110000",
        "RRULE:FREQ=WEEKLY;COUNT=2",
      ]);
      const occ = projectOccurrences(e, HORIZON);
      expect(occ.map((o) => o.startAt.toISOString())).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-13T15:00:00.000Z",
        "2026-07-15T01:00:00.000Z",
      ]);
      const extra = occ.at(-1);
      if (extra?.schedule.kind !== "timed") throw new Error("expected timed");
      expect(extra.schedule.timeZone).toBe("America/Denver" as TimeZone);
      expect(extra.endAt?.getTime()).toBe(
        extra.startAt.getTime() + 30 * 60 * 1000,
      );
    });

    it("combines RDATE and EXDATE without double-projecting a restated instant", () => {
      const e = weekly([
        // RDATE restates the second occurrence; EXDATE removes the third.
        "RDATE;TZID=America/Denver:20260713T090000",
        "EXDATE;TZID=America/Denver:20260720T090000",
        "RRULE:FREQ=WEEKLY;COUNT=3",
      ]);
      expect(starts(e)).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-13T15:00:00.000Z",
      ]);
    });

    it("windows RDATEs to the series' own [DTSTART, UNTIL]", () => {
      // A thisAndFollowing split truncates one half's UNTIL and re-anchors
      // the other's DTSTART; out-of-window RDATEs belong to the other half.
      const e = weekly([
        "RDATE;TZID=America/Denver:20260601T090000,20260725T090000",
        "RRULE:FREQ=WEEKLY;UNTIL=20260714T150000Z",
      ]);
      // Jun 1 precedes DTSTART, Jul 25 exceeds UNTIL: both dropped.
      expect(starts(e)).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-13T15:00:00.000Z",
      ]);
    });

    it("projects zero occurrences for a long-dead COUNT series with EXDATE (History 201 regression)", () => {
      // The prod phantom: a 2013 course whose EXDATE line re-anchored the
      // whole series at the projection run's wall clock, dragging 15 weekly
      // occurrences into the present-day horizon.
      const e = event(
        timed(
          "2013-09-04T11:00:00-05:00",
          "2013-09-04T11:50:00-05:00",
          "America/Chicago",
        ),
        {
          kind: "seriesMaster",
          rules: [
            "EXDATE;TZID=America/Chicago:20131023T110000",
            "RRULE:FREQ=WEEKLY;COUNT=15;BYDAY=WE",
          ],
        },
      );
      expect(projectOccurrences(e, HORIZON)).toHaveLength(0);
    });

    it("still honors the floated UNTIL when an EXDATE line is present", () => {
      const e = event(
        timed("2026-06-01T03:00:00-06:00", "2026-06-01T03:15:00-06:00"),
        {
          kind: "seriesMaster",
          rules: [
            "EXDATE;TZID=America/Denver:20260603T030000",
            "RRULE:FREQ=DAILY;UNTIL=20260610T055959Z",
          ],
        },
      );
      const result = starts(e);
      expect(result).toHaveLength(8);
      expect(result).not.toContain("2026-06-03T09:00:00.000Z");
      expect(result.at(-1)).toBe("2026-06-09T09:00:00.000Z");
    });
  });

  describe("truncateRulesBefore", () => {
    it("appends a strictly-before UNTIL (one second earlier, inclusive bound)", () => {
      const [rule] = truncateRulesBefore(
        ["RRULE:FREQ=WEEKLY"],
        new Date("2026-07-21T15:00:00.000Z"),
      );
      expect(rule).toBe("RRULE:FREQ=WEEKLY;UNTIL=20260721T145959Z");
    });

    it("drops a COUNT (mutually exclusive with UNTIL) and replaces a stale UNTIL", () => {
      const [rule] = truncateRulesBefore(
        ["RRULE:FREQ=WEEKLY;COUNT=10;UNTIL=20270101T000000Z"],
        new Date("2026-07-21T15:00:00.000Z"),
      );
      expect(rule).toBe("RRULE:FREQ=WEEKLY;UNTIL=20260721T145959Z");
    });

    it("bounds only RRULE lines, leaving EXDATE/RDATE lines untouched", () => {
      const rules = truncateRulesBefore(
        [
          "EXDATE;TZID=America/Chicago:20131023T110000",
          "RRULE:FREQ=WEEKLY;COUNT=15",
        ],
        new Date("2026-07-21T15:00:00.000Z"),
      );
      expect(rules).toEqual([
        "EXDATE;TZID=America/Chicago:20131023T110000",
        "RRULE:FREQ=WEEKLY;UNTIL=20260721T145959Z",
      ]);
    });

    it("truncates the projection to occurrences before the split point", () => {
      const e = event(
        timed("2026-07-06T09:00:00-06:00", "2026-07-06T09:30:00-06:00"),
        {
          kind: "seriesMaster",
          rules: truncateRulesBefore(
            ["RRULE:FREQ=WEEKLY;COUNT=5"],
            // Split at the third occurrence (2026-07-20 09:00 -06:00 = 15:00Z).
            new Date("2026-07-20T15:00:00.000Z"),
          ),
        },
      );
      const starts = projectOccurrences(e, HORIZON).map((o) =>
        o.startAt.toISOString(),
      );
      expect(starts).toEqual([
        "2026-07-06T15:00:00.000Z",
        "2026-07-13T15:00:00.000Z",
      ]);
    });
  });

  describe("occurrenceScheduleAfterSeriesEdit", () => {
    it("keeps the recurrence instant when the master time is unchanged", () => {
      const master = timed(
        "2026-07-14T09:00:00-06:00",
        "2026-07-14T10:00:00-06:00",
      );
      expect(
        occurrenceScheduleAfterSeriesEdit(
          master,
          master,
          "2026-07-21T09:00:00-06:00" as never,
        ),
      ).toEqual(
        timed("2026-07-21T09:00:00-06:00", "2026-07-21T10:00:00-06:00"),
      );
    });

    it("applies the master start delta to the recurrence instant", () => {
      const previous = timed(
        "2026-07-14T09:00:00-06:00",
        "2026-07-14T10:00:00-06:00",
      );
      const next = timed(
        "2026-07-14T10:00:00-06:00",
        "2026-07-14T11:00:00-06:00",
      );
      expect(
        occurrenceScheduleAfterSeriesEdit(
          previous,
          next,
          "2026-07-21T09:00:00-06:00" as never,
        ),
      ).toEqual(
        timed("2026-07-21T10:00:00-06:00", "2026-07-21T11:00:00-06:00"),
      );
    });
  });
});
