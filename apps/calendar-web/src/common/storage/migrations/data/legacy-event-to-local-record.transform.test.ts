import { Origin } from "@core/constants/core.constants";
import { type ValidatedCompassEvent } from "@core/types/compass-event.contracts";
import { CalendarIdSchema, type EventId } from "@core/types/domain-primitives";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  transformLegacyEvents,
  transformLegacyEventToLocalRecord,
} from "./legacy-event-to-local-record.transform";
import { describe, expect, it } from "bun:test";

const sentinelCalendarId = CalendarIdSchema.parse(createObjectIdString());

const baseLegacy = (
  overrides: Partial<
    ValidatedCompassEvent & {
      order?: number;
      __compassDemoEvent?: true;
      isSomeday?: boolean;
    }
  > = {},
): ValidatedCompassEvent & {
  order?: number;
  __compassDemoEvent?: true;
  isSomeday?: boolean;
} => ({
  _id: createObjectIdString(),
  title: "Legacy event",
  startDate: "2026-05-05T09:00:00.000-05:00",
  endDate: "2026-05-05T10:00:00.000-05:00",
  origin: Origin.COMPASS,
  user: "unauthenticated",
  ...overrides,
});

describe("transformLegacyEventToLocalRecord", () => {
  it("converts a legacy timed event, stamping the browser IANA zone", () => {
    const legacy = baseLegacy();

    const record = transformLegacyEventToLocalRecord(
      legacy,
      sentinelCalendarId,
    );

    expect(record?.event.schedule.kind).toBe("timed");
    if (record?.event.schedule.kind === "timed") {
      expect(record.event.schedule.timeZone).toBeTruthy();
      expect(record.event.schedule.start).toBe(
        new Date(
          legacy.startDate,
        ).toISOString() as typeof record.event.schedule.start,
      );
    }
    expect(record?.event.calendarId).toBe(sentinelCalendarId);
    expect(record?.isDemo).toBe(false);
  });

  it("normalizes a same-date all-day event to an exclusive end", () => {
    const legacy = baseLegacy({
      isAllDay: true,
      startDate: "2026-05-05",
      endDate: "2026-05-05",
    });

    const record = transformLegacyEventToLocalRecord(
      legacy,
      sentinelCalendarId,
    );

    expect(record?.event.schedule).toEqual({
      kind: "allDay",
      start: "2026-05-05",
      end: "2026-05-06",
    } as unknown as NonNullable<typeof record>["event"]["schedule"]);
  });

  it("keeps an already-exclusive multi-day all-day event's end untouched", () => {
    const legacy = baseLegacy({
      isAllDay: true,
      startDate: "2026-05-05",
      endDate: "2026-05-08",
    });

    const record = transformLegacyEventToLocalRecord(
      legacy,
      sentinelCalendarId,
    );

    expect(record?.event.schedule).toEqual({
      kind: "allDay",
      start: "2026-05-05",
      end: "2026-05-08",
    } as unknown as NonNullable<typeof record>["event"]["schedule"]);
  });

  it("drops legacy someday rows (schedule kind removed)", () => {
    const legacy = baseLegacy({
      isSomeday: true,
      startDate: "2026-05-04",
      endDate: "2026-05-10",
      order: 3,
    });

    const record = transformLegacyEventToLocalRecord(
      legacy,
      sentinelCalendarId,
    );

    expect(record).toBeNull();
  });

  it("defaults '' for missing title/description", () => {
    const legacy = baseLegacy({ title: undefined, description: undefined });

    const record = transformLegacyEventToLocalRecord(
      legacy,
      sentinelCalendarId,
    );

    expect(record?.event.content).toMatchObject({
      title: "",
      description: "",
    });
  });

  it("maps the demo marker onto isDemo", () => {
    const legacy = baseLegacy({ __compassDemoEvent: true });

    const record = transformLegacyEventToLocalRecord(
      legacy,
      sentinelCalendarId,
    );

    expect(record?.isDemo).toBe(true);
  });

  it("returns null for a row with unparseable dates", () => {
    const legacy = baseLegacy({ startDate: "not-a-date", endDate: "" });

    const record = transformLegacyEventToLocalRecord(
      legacy,
      sentinelCalendarId,
    );

    expect(record).toBeNull();
  });
});

describe("transformLegacyEvents", () => {
  it("excludes legacy someday rows from the transformed batch", () => {
    const someday = baseLegacy({
      isSomeday: true,
      startDate: "2026-05-04T00:00:00.000Z",
      endDate: "2026-05-10T00:00:00.000Z",
      order: 5,
    });
    const scheduled = baseLegacy();

    const records = transformLegacyEvents(
      [someday, scheduled],
      sentinelCalendarId,
    );

    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(scheduled._id as EventId);
  });

  it("drops unparseable rows without throwing", () => {
    const bad = baseLegacy({ startDate: "nope", endDate: "" });
    const good = baseLegacy();

    const records = transformLegacyEvents([bad, good], sentinelCalendarId);

    expect(records).toHaveLength(1);
    expect(records[0]?.id).toBe(good._id as EventId);
  });
});
