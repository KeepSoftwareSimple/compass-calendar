import { faker } from "@faker-js/faker";
import { type CalendarId, type EventId } from "@core/types/domain-primitives";
import { syncInvalidationToServerMessages } from "@backend/servers/sse/sync-invalidation.to-server-message";

const objectId = () => faker.database.mongodbObjectId();

describe("syncInvalidationToServerMessages", () => {
  it("maps an event invalidation to eventsChanged", () => {
    const eventId = objectId() as EventId;
    const calendarId = objectId() as CalendarId;
    expect(
      syncInvalidationToServerMessages({
        kind: "event",
        eventId: eventId as never,
        calendarId: calendarId as never,
      }),
    ).toEqual([
      {
        type: "eventsChanged",
        calendarId,
        eventIds: [eventId],
        reason: "reconciled",
      },
    ]);
  });

  it("maps a calendar invalidation to calendarsChanged and eventsChanged", () => {
    const calendarId = objectId() as CalendarId;
    expect(
      syncInvalidationToServerMessages({
        kind: "calendar",
        connectionId: objectId() as never,
        calendarId: calendarId as never,
      }),
    ).toEqual([
      { type: "calendarsChanged", calendarIds: [calendarId] },
      {
        type: "eventsChanged",
        calendarId,
        eventIds: [],
        reason: "reconciled",
      },
    ]);
  });

  it("maps a connection invalidation to both a calendars and an events refetch signal", () => {
    // A connection change (auth state, calendar membership) can change which
    // events the browser should show, e.g. a calendar going read-only or a
    // connection being revoked — calendarsChanged alone leaves the event
    // queries stale, since eventsChanged is the only signal the client ever
    // refetches events on.
    expect(
      syncInvalidationToServerMessages({
        kind: "connection",
        connectionId: objectId() as never,
      }),
    ).toEqual([
      { type: "calendarsChanged", calendarIds: [] },
      {
        type: "eventsChanged",
        calendarId: "000000000000000000000000" as CalendarId,
        eventIds: [],
        reason: "reconciled",
      },
    ]);
  });

  it("maps incomplete import progress to syncing", () => {
    expect(
      syncInvalidationToServerMessages({
        kind: "importProgress",
        connectionId: objectId() as never,
        progress: {
          calendarsTotal: 2,
          calendarsCompleted: 1,
          complete: false,
        },
      }),
    ).toEqual([{ type: "syncStatusChanged", sync: { status: "syncing" } }]);
  });

  it("maps complete import progress to healthy + importCompleted", () => {
    expect(
      syncInvalidationToServerMessages({
        kind: "importProgress",
        connectionId: objectId() as never,
        progress: {
          calendarsTotal: 2,
          calendarsCompleted: 2,
          complete: true,
        },
      }),
    ).toEqual([
      { type: "syncStatusChanged", sync: { status: "healthy" } },
      {
        type: "importCompleted",
        operation: "full",
        eventsCount: 0,
        calendarsCount: 2,
      },
    ]);
  });

  it("skips command invalidations (paired with event on the write path)", () => {
    expect(
      syncInvalidationToServerMessages({
        kind: "command",
        commandId: objectId() as never,
      }),
    ).toEqual([]);
  });
});
