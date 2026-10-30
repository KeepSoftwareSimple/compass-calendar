import { EventIdSchema } from "@core/types/domain-primitives";
import {
  type EventSchedule,
  EventScheduleSchema,
} from "@core/types/event.contracts";
import {
  gridEventsFromProdOverlapExport,
  type ProdOverlapExportInstance,
} from "@web/grid/layout/prod-overlap-export.fixture";
import { createTimedEventLayout } from "@web/grid/layout/timed-deck.layout";
import {
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it } from "bun:test";

const denver = "America/Denver";

/** E2E seed shape (sync instants) until prod export artifact is checked in. */
const tylerOct31ExportInstances = (): ProdOverlapExportInstance[] => [
  {
    eventId: EventIdSchema.parse("507f1f77bcf86cd799439021"),
    calendarId: "507f1f77bcf86cd799439013",
    label: "H: Fall Festival | Venture Church",
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: "2026-10-31T21:00:00.000Z",
      end: "2026-10-31T23:30:00.000Z",
      timeZone: denver,
    }),
    recurrence: { kind: "single" },
  },
  {
    eventId: EventIdSchema.parse("507f1f77bcf86cd799439022"),
    calendarId: "507f1f77bcf86cd799439014",
    label: "Record Compass demo",
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: "2026-10-31T21:30:00.000Z",
      end: "2026-10-31T23:00:00.000Z",
      timeZone: denver,
    }),
    recurrence: { kind: "single" },
  },
  {
    eventId: EventIdSchema.parse("507f1f77bcf86cd799439023"),
    calendarId: "507f1f77bcf86cd799439015",
    label: "Update 4e2d",
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: "2026-11-01T00:30:00.000Z",
      end: "2026-11-01T01:00:00.000Z",
      timeZone: denver,
    }),
    recurrence: {
      kind: "occurrence",
      seriesId: EventIdSchema.parse("507f1f77bcf86cd799439098"),
    },
  },
  {
    eventId: EventIdSchema.parse("507f1f77bcf86cd799439011"),
    calendarId: "507f1f77bcf86cd799439011",
    label: "Unwind",
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: "2026-11-01T01:00:00.000Z",
      end: "2026-11-01T02:00:00.000Z",
      timeZone: denver,
    }),
    recurrence: {
      kind: "occurrence",
      seriesId: EventIdSchema.parse("507f1f77bcf86cd799439099"),
    },
  },
  {
    eventId: EventIdSchema.parse("507f1f77bcf86cd799439012"),
    calendarId: "507f1f77bcf86cd799439012",
    label: "Monthly Ritual",
    schedule: {
      kind: "timed",
      start: "2026-11-01T01:30:00.000Z",
      end: "2026-10-31T19:00:00",
      timeZone: denver,
    } as EventSchedule,
    recurrence: { kind: "single" },
  },
];

afterEach(() => {
  resetEffectiveTimeZoneStoreForTests();
});

describe("prod overlap export → grid deck layout", () => {
  it("fans Unwind and Monthly Ritual after view-model formatting (Tyler Oct 31)", () => {
    setBrowserTimeZoneForTests("Etc/UTC");
    setCalendarTimeZoneHint(denver);
    setPinnedTimeZone(denver);

    const gridEvents = gridEventsFromProdOverlapExport(
      tylerOct31ExportInstances(),
    );
    const laid = createTimedEventLayout(gridEvents);

    const unwind = laid.find((item) => item.event.title === "Unwind");
    const ritual = laid.find((item) => item.event.title === "Monthly Ritual");
    const update = laid.find((item) => item.event.title === "Update 4e2d");

    expect(unwind?.deckLayout?.groupSize).toBe(2);
    expect(ritual?.deckLayout?.groupSize).toBe(2);
    expect(unwind?.deckLayout?.order).not.toBe(ritual?.deckLayout?.order);
    expect(update?.deckLayout).toBeNull();
  });
});
