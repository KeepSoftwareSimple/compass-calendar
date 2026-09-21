import { type EventId } from "@core/types/domain-primitives";
import { type SyncEventCalendarId } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  type BusyAvailabilityDeps,
  computeBusyAvailability,
  mergeBusyIntervals,
} from "@sync/domain/busy-query.service";

const iv = (start: string, end: string) => ({
  start: new Date(start),
  end: new Date(end),
});
// Compare merged output as ISO pairs for readable assertions.
const iso = (intervals: { start: Date; end: Date }[]) =>
  intervals.map((i) => [i.start.toISOString(), i.end.toISOString()]);

describe("mergeBusyIntervals", () => {
  it("returns nothing for no intervals", () => {
    expect(mergeBusyIntervals([])).toEqual([]);
  });

  it("passes a single interval through", () => {
    expect(
      iso(mergeBusyIntervals([iv("2026-07-14T09:00Z", "2026-07-14T10:00Z")])),
    ).toEqual([["2026-07-14T09:00:00.000Z", "2026-07-14T10:00:00.000Z"]]);
  });

  it("keeps disjoint intervals separate and sorted", () => {
    const out = mergeBusyIntervals([
      iv("2026-07-14T13:00Z", "2026-07-14T14:00Z"),
      iv("2026-07-14T09:00Z", "2026-07-14T10:00Z"),
    ]);
    expect(iso(out)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T10:00:00.000Z"],
      ["2026-07-14T13:00:00.000Z", "2026-07-14T14:00:00.000Z"],
    ]);
  });

  it("merges overlapping intervals", () => {
    const out = mergeBusyIntervals([
      iv("2026-07-14T09:00Z", "2026-07-14T10:30Z"),
      iv("2026-07-14T10:00Z", "2026-07-14T11:00Z"),
    ]);
    expect(iso(out)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T11:00:00.000Z"],
    ]);
  });

  it("merges touching intervals, leaving no free gap between them", () => {
    const out = mergeBusyIntervals([
      iv("2026-07-14T09:00Z", "2026-07-14T10:00Z"),
      iv("2026-07-14T10:00Z", "2026-07-14T11:00Z"),
    ]);
    expect(iso(out)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T11:00:00.000Z"],
    ]);
  });

  it("absorbs a fully nested interval", () => {
    const out = mergeBusyIntervals([
      iv("2026-07-14T09:00Z", "2026-07-14T12:00Z"),
      iv("2026-07-14T10:00Z", "2026-07-14T10:30Z"),
    ]);
    expect(iso(out)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T12:00:00.000Z"],
    ]);
  });

  it("is independent of input order", () => {
    const forward = mergeBusyIntervals([
      iv("2026-07-14T09:00Z", "2026-07-14T10:00Z"),
      iv("2026-07-14T09:30Z", "2026-07-14T11:00Z"),
      iv("2026-07-14T13:00Z", "2026-07-14T14:00Z"),
    ]);
    const shuffled = mergeBusyIntervals([
      iv("2026-07-14T13:00Z", "2026-07-14T14:00Z"),
      iv("2026-07-14T09:30Z", "2026-07-14T11:00Z"),
      iv("2026-07-14T09:00Z", "2026-07-14T10:00Z"),
    ]);
    expect(iso(forward)).toEqual(iso(shuffled));
    expect(iso(forward)).toEqual([
      ["2026-07-14T09:00:00.000Z", "2026-07-14T11:00:00.000Z"],
      ["2026-07-14T13:00:00.000Z", "2026-07-14T14:00:00.000Z"],
    ]);
  });

  it("does not merge touching intervals with different occupancy facts", () => {
    const out = mergeBusyIntervals([
      {
        start: new Date("2026-07-14T09:00Z"),
        end: new Date("2026-07-14T10:00Z"),
        hostIsOrganizer: true,
        hostResponseStatus: null,
      },
      {
        start: new Date("2026-07-14T10:00Z"),
        end: new Date("2026-07-14T11:00Z"),
        hostIsOrganizer: false,
        hostResponseStatus: "needsAction",
      },
    ]);

    expect(out).toHaveLength(2);
    expect(out[0]?.hostIsOrganizer).toBe(true);
    expect(out[1]?.hostResponseStatus).toBe("needsAction");
  });

  it("drops empty (zero-length) intervals", () => {
    const out = mergeBusyIntervals([
      iv("2026-07-14T09:00Z", "2026-07-14T09:00Z"),
      iv("2026-07-14T10:00Z", "2026-07-14T11:00Z"),
    ]);
    expect(iso(out)).toEqual([
      ["2026-07-14T10:00:00.000Z", "2026-07-14T11:00:00.000Z"],
    ]);
  });
});

describe("computeBusyAvailability truncation", () => {
  it("fails closed when the overlap read is truncated", async () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    const tenantId = "tenant" as TenantId;
    const principalId = "principal" as PrincipalId;
    const calendarId = "calendar" as SyncEventCalendarId;
    const connectionId = "connection" as ConnectionId;
    const deps = {
      occurrences: {
        listBusyOverlapping: async () => ({
          intervals: [
            {
              startAt: new Date("2026-07-14T09:00:00.000Z"),
              endAt: new Date("2026-07-14T10:00:00.000Z"),
              eventId: "event" as EventId,
              calendarId,
            },
          ],
          truncated: true,
        }),
      },
      resources: {
        listEventResourceFreshnessByCalendar: async () =>
          new Map([
            [
              calendarId,
              {
                connectionId,
                activeGeneration: 1,
                lastSuccessAt: now,
                cursorExpiredBackoffUntil: null,
              },
            ],
          ]),
      },
      connections: {
        listByPrincipal: async () => [
          {
            _id: connectionId,
            state: "healthy",
            lastSyncedAt: now,
            lastHealthyAt: now,
            account: { email: "host@example.com" },
          },
        ],
      },
      calendars: { listByPrincipal: async () => [] },
    } as unknown as BusyAvailabilityDeps;

    const result = await computeBusyAvailability(deps, {
      tenantId,
      principalId,
      calendarIds: [calendarId],
      start: new Date("2026-07-14T00:00:00.000Z"),
      end: new Date("2026-07-15T00:00:00.000Z"),
      maxAgeMs: 60_000,
      now,
    });

    expect(result.truncated).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.bookable).toBe(false);
    expect(result.intervals).toHaveLength(1);
    expect(result.byCalendar).toEqual([
      expect.objectContaining({
        calendarId,
        intervals: expect.any(Array),
      }),
    ]);
    expect(result.byCalendar[0]?.intervals).toHaveLength(1);
  });
});
