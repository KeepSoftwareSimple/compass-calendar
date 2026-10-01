import dayjs from "@core/util/date/dayjs";
import { buildDesktopAgenda } from "@web/desktop/desktop-agenda.logic";
import { setEffectiveTimeZoneForTests } from "@web/timezone/effective-timezone.store";
import { describe, expect, it } from "bun:test";

describe("buildDesktopAgenda", () => {
  setEffectiveTimeZoneForTests("UTC");
  const now = dayjs("2026-10-01T15:00:00.000Z");

  it("drops demo events and rows without ids", () => {
    expect(
      buildDesktopAgenda(now, [
        {
          _id: "evt-1",
          title: "Real",
          startDate: "2026-10-01T16:00:00.000Z",
          endDate: "2026-10-01T17:00:00.000Z",
        },
        {
          title: "Draft",
          startDate: "2026-10-01T18:00:00.000Z",
          endDate: "2026-10-01T19:00:00.000Z",
        },
        {
          _id: "demo",
          title: "Sample",
          startDate: "2026-10-01T19:00:00.000Z",
          endDate: "2026-10-01T20:00:00.000Z",
          isDemo: true,
        },
      ]),
    ).toEqual([
      {
        id: "evt-1",
        title: "Real",
        startsAt: "2026-10-01T16:00:00.000Z",
        endsAt: "2026-10-01T17:00:00.000Z",
      },
    ]);
  });

  it("keeps events that overlap today and sorts by start", () => {
    expect(
      buildDesktopAgenda(now, [
        {
          _id: "late",
          title: "Late",
          startDate: "2026-10-01T20:00:00.000Z",
          endDate: "2026-10-01T21:00:00.000Z",
        },
        {
          _id: "early",
          title: "Early",
          startDate: "2026-10-01T14:00:00.000Z",
          endDate: "2026-10-01T15:00:00.000Z",
        },
        {
          _id: "tomorrow",
          title: "Tomorrow",
          startDate: "2026-10-02T09:00:00.000Z",
          endDate: "2026-10-02T10:00:00.000Z",
        },
      ]),
    ).toEqual([
      {
        id: "early",
        title: "Early",
        startsAt: "2026-10-01T14:00:00.000Z",
        endsAt: "2026-10-01T15:00:00.000Z",
      },
      {
        id: "late",
        title: "Late",
        startsAt: "2026-10-01T20:00:00.000Z",
        endsAt: "2026-10-01T21:00:00.000Z",
      },
    ]);
  });
});
