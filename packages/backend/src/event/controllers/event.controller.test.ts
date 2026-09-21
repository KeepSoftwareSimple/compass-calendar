import { faker } from "@faker-js/faker";
import { type Response } from "express";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Status } from "@core/errors/status.codes";
import calendarService from "@backend/calendar/services/calendar.service";
import { CONFIG } from "@backend/common/constants/config.constants";
import { composeOccurrenceId } from "@backend/common/services/sync-service/occurrence-id";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import {
  eventMutationError,
  toEventMutationError,
} from "@backend/event/event.error";
import eventController, {
  logLevelForEventFailure,
  syncFailureLogContext,
} from "./event.controller";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

const sessionReq = (userId: string, extras: Partial<SessionRequest> = {}) =>
  ({
    session: { getUserId: () => userId },
    query: {},
    params: {},
    body: {},
    ...extras,
  }) as unknown as SessionRequest;

const jsonRes = () => {
  const json = mock();
  const res = {
    status: mock().mockReturnThis(),
    json,
    send: mock().mockReturnThis(),
  } as unknown as Response;
  return { res, json };
};

const sampleCreateBody = () => ({
  id: objectId(),
  calendarId: objectId(),
  content: { kind: "details", title: "Lunch", description: "", location: "" },
  schedule: {
    kind: "timed",
    start: "2026-07-14T12:00:00.000Z",
    end: "2026-07-14T13:00:00.000Z",
    timeZone: "UTC",
  },
  recurrence: { kind: "single" },
});

const mockSyncCommandFailure = (failureReason: string) => {
  spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
    submitCommand: mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          command: {
            outcome: {
              state: "failed" as const,
              failureReason,
            },
          },
        },
      }),
    ),
  } as never);
};

const createViaSync = async () => {
  const { res, json } = jsonRes();
  await eventController.create(
    sessionReq(objectId(), { body: sampleCreateBody() }),
    res,
  );
  return { res, json };
};

const pointAtUnreachableSync = () => {
  // Point at an unreachable sync service so calls that aren't mocked below
  // fail at fetch, proving the controller fails closed on a sync outage
  // rather than silently returning empty/success. This dedicated file gets
  // its own test process, so the lazy sync client singleton is built from
  // these values rather than a default from another file.
  CONFIG.SYNC_SERVICE_URL = "http://sync.invalid:4999";
  CONFIG.SYNC_INTERNAL_AUTH_TOKEN = "test-sync-secret";
};

describe("EventController", () => {
  // The shared backend harness's global beforeEach (mock.setup.ts) resets
  // CONFIG to its file-load baseline before every test body runs, which
  // would wipe a beforeAll-set override. Use beforeEach here so this runs
  // after that reset, not before it.
  beforeEach(() => {
    pointAtUnreachableSync();
  });

  afterEach(() => {
    mock.restore();
  });

  it("fails closed on a sync outage when listing events", async () => {
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: false as const,
          error: {
            kind: "unavailable" as const,
            correlationId: "corr-list",
          },
        }),
      ),
    } as never);

    const { res, json } = jsonRes();
    await eventController.readAll(
      sessionReq(objectId(), {
        query: {
          start: "2026-07-14T00:00:00.000Z",
          end: "2026-07-21T00:00:00.000Z",
        },
      }),
      res,
    );

    const status = (res.status as ReturnType<typeof mock>).mock.calls[0]?.[0];
    // SyncClientError → retryable PROVIDER_FAILURE (502), not a generic 500.
    expect(status).toBe(Status.BAD_GATEWAY);
    expect(json).toHaveBeenCalledWith({
      code: "PROVIDER_FAILURE",
      message: "Failed to list calendars from sync (unavailable)",
      retryable: true,
    });
  });

  it("includes the contract mismatch detail on a list-events failure", async () => {
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: { calendars: [{ id: objectId() }] },
        }),
      ),
      listFullEvents: mock(() =>
        Promise.resolve({
          ok: false as const,
          error: {
            kind: "invalidResponse" as const,
            status: 200,
            correlationId: "corr-detail",
            detail: "issues=instances.0.lastFullListAt: unrecognized_keys",
          },
        }),
      ),
    } as never);

    const { res, json } = jsonRes();
    await eventController.readAll(
      sessionReq(objectId(), {
        query: {
          start: "2026-07-14T00:00:00.000Z",
          end: "2026-07-21T00:00:00.000Z",
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.BAD_GATEWAY);
    expect(json).toHaveBeenCalledWith({
      code: "PROVIDER_FAILURE",
      message:
        "Failed to list events from sync (invalidResponse): " +
        "issues=instances.0.lastFullListAt: unrecognized_keys",
      retryable: true,
    });
  });

  it("runs at most four list-events calls in flight across concurrent range reads", async () => {
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const listFullEvents = mock(() => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise((resolve) => {
        releases.push(() => {
          active -= 1;
          resolve({
            ok: true as const,
            value: { instances: [], nextCursor: null },
          });
        });
      });
    });
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: { calendars: [{ id: objectId() }] },
        }),
      ),
      listFullEvents,
    } as never);

    const reads = Array.from({ length: 10 }, () => {
      const { res } = jsonRes();
      return eventController.readAll(
        sessionReq(objectId(), {
          query: {
            start: "2026-07-14T00:00:00.000Z",
            end: "2026-07-21T00:00:00.000Z",
          },
        }),
        res,
      );
    });

    await Bun.sleep(0);
    expect(listFullEvents).toHaveBeenCalledTimes(4);
    expect(peak).toBe(4);

    while (releases.length > 0 || active > 0) {
      releases.splice(0).forEach((release) => release());
      await Bun.sleep(0);
    }

    await Promise.all(reads);
    expect(listFullEvents).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
  });

  it("resolves owned calendars for a read with activeOnly, never the full list", async () => {
    // resolveSyncCalendarIds intersects the request's calendarIds against
    // "owned" ids — but while the browser's own calendar list is still
    // loading, it sends NO calendarIds at all (undefined), and the backend
    // answers with every owned id verbatim. That call must already be scoped
    // to active calendars, or a retired calendar's events get read on every
    // page load that races the calendars query. The listCalendars stub
    // asserts the activeOnly option below.
    const activeCalendarId = objectId();
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    const listFullEvents = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: { instances: [], nextCursor: null },
      }),
    );
    const listCalendars = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: { calendars: [{ id: activeCalendarId }] },
      }),
    );
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars,
      listFullEvents,
    } as never);

    const { res, json } = jsonRes();
    await eventController.readAll(
      sessionReq(objectId(), {
        query: {
          start: "2026-07-14T00:00:00.000Z",
          end: "2026-07-21T00:00:00.000Z",
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(json).toHaveBeenCalledWith({ events: [] });
    expect(listFullEvents).toHaveBeenCalledTimes(1);
    // The ownership read must be scoped to active calendars.
    expect((listCalendars.mock.calls as unknown[][])[0]?.[1]).toEqual({
      activeOnly: true,
    });
    const pageQuery = (
      (listFullEvents.mock.calls as unknown[][])[0] as never as [
        unknown,
        { calendarIds: string[]; limit: number },
      ]
    )[1];
    expect(pageQuery.calendarIds).toEqual([activeCalendarId]);
    // 7-day window → 7 * 50 events/day, well under Sync's 500 cap.
    expect(pageQuery.limit).toBe(350);
  });

  it("sizes the first page to a day view instead of Sync's 500-row default", async () => {
    const activeCalendarId = objectId();
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    const listFullEvents = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: { instances: [], nextCursor: null },
      }),
    );
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: { calendars: [{ id: activeCalendarId }] },
        }),
      ),
      listFullEvents,
    } as never);

    const { res } = jsonRes();
    await eventController.readAll(
      sessionReq(objectId(), {
        query: {
          start: "2026-07-14T00:00:00.000Z",
          end: "2026-07-15T00:00:00.000Z",
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    const pageQuery = (
      (listFullEvents.mock.calls as unknown[][])[0] as never as [
        unknown,
        { limit: number },
      ]
    )[1];
    expect(pageQuery.limit).toBe(50);
  });

  describe("title search", () => {
    const timedInstance = (
      title: string,
      start: string,
      calendarId: string,
    ) => ({
      eventId: objectId(),
      calendarId,
      content: {
        title,
        description: "",
        location: null,
        organizer: null,
        attendees: [] as const,
        conference: null,
      },
      schedule: {
        kind: "timed" as const,
        start,
        end: "2099-01-01T01:00:00.000Z",
        timeZone: "UTC",
      },
      recurrence: { kind: "single" as const },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const mockOwnedList = (calendarId: string, instances: unknown[]) => {
      spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
      const listFullEvents = mock(() =>
        Promise.resolve({
          ok: true as const,
          value: { instances, nextCursor: null },
        }),
      );
      spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
        listCalendars: mock(() =>
          Promise.resolve({
            ok: true as const,
            value: { calendars: [{ id: calendarId }] },
          }),
        ),
        listFullEvents,
      } as never);
      return listFullEvents;
    };

    const titles = (json: ReturnType<typeof mock>) =>
      (json.mock.calls[0]?.[0] as { events: { content: { title: string } }[] })
        .events;

    it("matches titles case-insensitively", async () => {
      const calendarId = objectId();
      mockOwnedList(calendarId, [
        timedInstance("Dentist", "2026-09-16T09:00:00.000Z", calendarId),
        timedInstance("Standup", "2026-09-16T10:00:00.000Z", calendarId),
      ]);

      const { res, json } = jsonRes();
      await eventController.readAll(
        sessionReq(objectId(), { query: { q: "dent" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(Status.OK);
      expect(titles(json).map((event) => event.content.title)).toEqual([
        "Dentist",
      ]);
    });

    it("scopes the scan to calendars the signed-in user owns", async () => {
      const ownedId = objectId();
      const listFullEvents = mockOwnedList(ownedId, []);

      const { res } = jsonRes();
      await eventController.readAll(
        sessionReq(objectId(), { query: { q: "dent" } }),
        res,
      );

      const pageQuery = (
        (listFullEvents.mock.calls as unknown[][])[0] as never as [
          unknown,
          { calendarIds: string[] },
        ]
      )[1];
      expect(pageQuery.calendarIds).toEqual([ownedId]);
    });

    it("excludes events that start more than a year from now", async () => {
      const calendarId = objectId();
      mockOwnedList(calendarId, [
        timedInstance("Dentist", "2026-09-16T09:00:00.000Z", calendarId),
        timedInstance("Dentist", "2024-01-01T09:00:00.000Z", calendarId),
        timedInstance("Dentist", "2028-09-16T09:00:00.000Z", calendarId),
      ]);

      const { res, json } = jsonRes();
      await eventController.readAll(
        sessionReq(objectId(), { query: { q: "Dentist" } }),
        res,
      );

      expect(titles(json)).toHaveLength(1);
      expect(titles(json)[0]?.content.title).toBe("Dentist");
    });

    it("caps matches at 20", async () => {
      const calendarId = objectId();
      mockOwnedList(
        calendarId,
        Array.from({ length: 25 }, (_, index) =>
          timedInstance(
            "Dentist",
            new Date(Date.now() + (index + 1) * 86_400_000).toISOString(),
            calendarId,
          ),
        ),
      );

      const { res, json } = jsonRes();
      await eventController.readAll(
        sessionReq(objectId(), { query: { q: "Dentist" } }),
        res,
      );

      expect(titles(json)).toHaveLength(20);
    });

    it("does not error when q contains regex metacharacters", async () => {
      const calendarId = objectId();
      mockOwnedList(calendarId, [
        timedInstance("Q(1)", "2026-09-16T09:00:00.000Z", calendarId),
      ]);

      const { res, json } = jsonRes();
      await eventController.readAll(
        sessionReq(objectId(), { query: { q: "Q(" } }),
        res,
      );

      expect(res.status).toHaveBeenCalledWith(Status.OK);
      expect(titles(json).map((event) => event.content.title)).toEqual([
        "Q(1)",
      ]);
    });
  });

  it("lists calendars once when draining multiple event pages", async () => {
    const activeCalendarId = objectId();
    spyOn(calendarService, "getLocalCalendar").mockResolvedValue(null);
    const listCalendars = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: { calendars: [{ id: activeCalendarId }] },
      }),
    );
    const listFullEvents = mock(
      (_principal: unknown, query: { cursor?: string }) => {
        if (query.cursor === undefined) {
          return Promise.resolve({
            ok: true as const,
            value: { instances: [], nextCursor: "page-2" },
          });
        }
        return Promise.resolve({
          ok: true as const,
          value: { instances: [], nextCursor: null },
        });
      },
    );
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars,
      listFullEvents,
    } as never);

    const { res } = jsonRes();
    await eventController.readAll(
      sessionReq(objectId(), {
        query: {
          start: "2026-07-14T00:00:00.000Z",
          end: "2026-07-21T00:00:00.000Z",
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    expect(listCalendars).toHaveBeenCalledTimes(1);
    expect(listFullEvents).toHaveBeenCalledTimes(2);
    const firstPage = (
      (listFullEvents.mock.calls as unknown[][])[0] as never as [
        unknown,
        { calendarIds: string[]; limit: number; cursor?: string },
      ]
    )[1];
    const secondPage = (
      (listFullEvents.mock.calls as unknown[][])[1] as never as [
        unknown,
        { calendarIds: string[]; limit: number; cursor?: string },
      ]
    )[1];
    expect(firstPage.calendarIds).toEqual([activeCalendarId]);
    expect(secondPage.calendarIds).toEqual([activeCalendarId]);
    expect(firstPage.limit).toBe(350);
    expect(secondPage.limit).toBe(350);
    expect(firstPage.cursor).toBeUndefined();
    expect(secondPage.cursor).toBe("page-2");
  });

  it("rejects a calendar move before submitting anything to sync", async () => {
    // toReplaceSubmitRequests would build an update command plus a move
    // command when calendarId is present, but sync unconditionally fails
    // every move (no executor exists) - submitting them in sequence would
    // apply the update, then throw on the move: a partial write. This must
    // never reach sync at all.
    const submitCommand = mock();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      submitCommand,
    } as never);

    const { res, json } = jsonRes();
    await eventController.replace(
      sessionReq(objectId(), {
        params: { id: objectId() },
        body: {
          calendarId: objectId(),
          content: {
            kind: "details",
            title: "Lunch",
            description: "",
            location: "",
          },
          schedule: {
            kind: "timed",
            start: "2026-07-14T12:00:00.000Z",
            end: "2026-07-14T13:00:00.000Z",
            timeZone: "UTC",
          },
          recurrence: { kind: "single" },
          scope: "all",
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      code: "MOVE_UNSUPPORTED",
      message: "Moving an event to a different calendar is not supported yet",
      retryable: false,
    });
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("fails closed on a sync outage when creating an event", async () => {
    const { res, json } = jsonRes();
    await eventController.create(
      sessionReq(objectId(), {
        body: {
          id: objectId(),
          calendarId: objectId(),
          content: {
            kind: "details",
            title: "Lunch",
            description: "",
            location: "",
          },
          schedule: {
            kind: "timed",
            start: "2026-07-14T12:00:00.000Z",
            end: "2026-07-14T13:00:00.000Z",
            timeZone: "UTC",
          },
          recurrence: { kind: "single" },
        },
      }),
      res,
    );

    const status = (res.status as ReturnType<typeof mock>).mock.calls[0]?.[0];
    expect(status).not.toBe(200);
    expect(json).toHaveBeenCalled();
  });

  it("rejects an unrecognized content key as 400 INVALID_INPUT, not a provider failure", async () => {
    const { res, json } = jsonRes();
    await eventController.create(
      sessionReq(objectId(), {
        body: {
          ...sampleCreateBody(),
          content: {
            ...sampleCreateBody().content,
            // Read-shaped fields a round-tripped event carries that the
            // strict write schema never accepts - see EditableContentSchema.
            organizer: { email: "host@example.com", displayName: null },
            attendees: [],
            conference: null,
          },
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_INPUT", retryable: false }),
    );
  });

  it("fails closed on a sync outage when replacing an event", async () => {
    const { res, json } = jsonRes();
    await eventController.replace(
      sessionReq(objectId(), {
        params: { id: objectId() },
        body: {
          content: {
            kind: "details",
            title: "Renamed",
            description: "",
            location: "",
          },
          schedule: {
            kind: "timed",
            start: "2026-07-14T12:00:00.000Z",
            end: "2026-07-14T13:00:00.000Z",
            timeZone: "UTC",
          },
          recurrence: { kind: "preserve" },
          scope: "this",
        },
      }),
      res,
    );

    const status = (res.status as ReturnType<typeof mock>).mock.calls[0]?.[0];
    expect(status).not.toBe(200);
    expect(json).toHaveBeenCalled();
  });

  it("fails closed on a sync outage when deleting an event", async () => {
    const { res, json } = jsonRes();
    await eventController.delete(
      sessionReq(objectId(), {
        params: { id: objectId() },
        query: { scope: "this" },
      }),
      res,
    );

    const status = (res.status as ReturnType<typeof mock>).mock.calls[0]?.[0];
    expect(status).not.toBe(204);
    expect(status).not.toBe(200);
    expect(json).toHaveBeenCalled();
  });

  it("rejects attendees on a calendar sync does not list as writable and inviting, before any submit", async () => {
    // A create targeting the Compass local calendar (never in sync's list)
    // or any unknown id: the guest list has nowhere to be delivered, so this
    // must be a typed 4xx with NO command submitted.
    const submitCommand = mock();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            calendars: [
              {
                id: objectId(), // a different (writable) calendar
                capabilities: {
                  canWriteEvents: true,
                  canInviteAttendees: true,
                },
              },
            ],
          },
        }),
      ),
      submitCommand,
    } as never);

    const { res, json } = jsonRes();
    const body = sampleCreateBody();
    await eventController.create(
      sessionReq(objectId(), {
        body: {
          ...body,
          content: {
            ...body.content,
            attendees: [{ email: "ada@example.com", displayName: null }],
          },
        },
      }),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.FORBIDDEN,
    );
    expect(json).toHaveBeenCalledWith({
      code: "ATTENDEES_UNSUPPORTED",
      message:
        "Guests can only be added to events on a writable calendar that can invite attendees",
      retryable: false,
    });
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("rejects a replace carrying attendees when the user has no writable inviting calendar", async () => {
    const submitCommand = mock();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            calendars: [
              // Read-only calendar: listed, but not writable.
              {
                id: objectId(),
                capabilities: {
                  canWriteEvents: false,
                  canInviteAttendees: false,
                },
              },
            ],
          },
        }),
      ),
      submitCommand,
    } as never);

    const { res, json } = jsonRes();
    await eventController.replace(
      sessionReq(objectId(), {
        params: { id: objectId() },
        body: {
          content: {
            kind: "details",
            title: "Kickoff",
            description: "",
            location: "",
            attendees: [{ email: "ada@example.com", displayName: null }],
          },
          schedule: {
            kind: "timed",
            start: "2026-07-14T12:00:00.000Z",
            end: "2026-07-14T13:00:00.000Z",
            timeZone: "UTC",
          },
          recurrence: { kind: "preserve" },
          scope: "this",
          invitation: "all",
        },
      }),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.FORBIDDEN,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ATTENDEES_UNSUPPORTED" }),
    );
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("rejects attendees on a writable calendar that cannot invite", async () => {
    const calendarId = objectId();
    const submitCommand = mock();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            calendars: [
              {
                id: calendarId,
                capabilities: {
                  canWriteEvents: true,
                  canInviteAttendees: false,
                },
              },
            ],
          },
        }),
      ),
      submitCommand,
    } as never);

    const { res, json } = jsonRes();
    const body = sampleCreateBody();
    await eventController.create(
      sessionReq(objectId(), {
        body: {
          ...body,
          calendarId,
          content: {
            ...body.content,
            attendees: [{ email: "ada@example.com", displayName: null }],
          },
        },
      }),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.FORBIDDEN,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "ATTENDEES_UNSUPPORTED" }),
    );
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("submits attendees + invitation for a writable calendar that can invite and echoes the guests optimistically", async () => {
    const calendarId = objectId();
    const submitCommand = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          command: {
            outcome: {
              state: "confirmed" as const,
              providerEventId: "prov-1",
              providerVersion: "v1",
            },
          },
        },
      }),
    );
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            calendars: [
              {
                id: calendarId,
                capabilities: {
                  canWriteEvents: true,
                  canInviteAttendees: true,
                },
              },
            ],
          },
        }),
      ),
      submitCommand,
    } as never);

    const { res, json } = jsonRes();
    const body = sampleCreateBody();
    await eventController.create(
      sessionReq(objectId(), {
        body: {
          ...body,
          calendarId,
          content: {
            ...body.content,
            attendees: [{ email: "ada@example.com", displayName: "Ada" }],
          },
          invitation: "all",
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.OK);
    const request = (
      (submitCommand.mock.calls as unknown[][])[0] as never as [
        unknown,
        { input: unknown },
      ]
    )[1];
    expect(request.input).toMatchObject({
      kind: "create",
      invitation: "all",
      attendeesEdit: "replace",
    });
    // The optimistic response event carries the intended guests.
    const responseBody = (
      (json.mock.calls as unknown[][])[0] as never as [
        { event: { content: { attendees?: unknown } } },
      ]
    )[0];
    expect(responseBody.event.content.attendees).toEqual([
      {
        email: "ada@example.com",
        displayName: "Ada",
        responseStatus: "needsAction",
      },
    ]);
  });

  it("rejects a malformed attendee as 400 INVALID_INPUT, not a 500", async () => {
    const { res, json } = jsonRes();
    const body = sampleCreateBody();
    await eventController.create(
      sessionReq(objectId(), {
        body: {
          ...body,
          content: {
            ...body.content,
            // Empty email fails AttendeeInputSchema before anything runs.
            attendees: [{ email: "", displayName: null }],
          },
        },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_INPUT", retryable: false }),
    );
  });

  it("keeps the retryable SYNC_UNAVAILABLE behavior when the new fields are present", async () => {
    const calendarId = objectId();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      listCalendars: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: {
            calendars: [
              {
                id: calendarId,
                capabilities: {
                  canWriteEvents: true,
                  canInviteAttendees: true,
                },
              },
            ],
          },
        }),
      ),
      submitCommand: mock(() =>
        Promise.resolve({
          ok: false as const,
          error: { kind: "unavailable" as const, correlationId: "corr-sub" },
        }),
      ),
    } as never);

    const { res, json } = jsonRes();
    const body = sampleCreateBody();
    await eventController.create(
      sessionReq(objectId(), {
        body: {
          ...body,
          calendarId,
          content: {
            ...body.content,
            attendees: [{ email: "ada@example.com", displayName: null }],
          },
          invitation: "all",
        },
      }),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.SERVICE_UNAVAILABLE,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "SYNC_UNAVAILABLE", retryable: true }),
    );
  });

  it("threads the invitation query param onto a delete (guest cancellation emails)", async () => {
    const submitCommand = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          command: {
            outcome: {
              state: "confirmed" as const,
              providerEventId: null,
              providerVersion: null,
            },
          },
        },
      }),
    );
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      submitCommand,
    } as never);

    const { res } = jsonRes();
    await eventController.delete(
      sessionReq(objectId(), {
        params: { id: objectId() },
        query: { scope: "all", invitation: "all" },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.NO_CONTENT);
    const request = (
      (submitCommand.mock.calls as unknown[][])[0] as never as [
        unknown,
        { input: unknown },
      ]
    )[1];
    expect(request.input).toMatchObject({ kind: "delete", invitation: "all" });
  });

  it("rejects an invalid invitation query param on delete as 400 INVALID_INPUT", async () => {
    const submitCommand = mock();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      submitCommand,
    } as never);

    const { res, json } = jsonRes();
    await eventController.delete(
      sessionReq(objectId(), {
        params: { id: objectId() },
        query: { scope: "all", invitation: "everyone" },
      }),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.BAD_REQUEST,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("maps authorizationRevoked to 410 GOOGLE_REVOKED (not retryable)", async () => {
    mockSyncCommandFailure("authorizationRevoked");
    const { res, json } = await createViaSync();

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.GONE,
    );
    expect(json).toHaveBeenCalledWith({
      code: "GOOGLE_REVOKED",
      message:
        "Calendar access expired or was revoked. Reconnect your calendar in Compass to resume syncing.",
      retryable: false,
    });
  });

  it("maps permanentProviderError to 502 PROVIDER_FAILURE (retryable)", async () => {
    mockSyncCommandFailure("permanentProviderError");
    const { res, json } = await createViaSync();

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      502,
    );
    expect(json).toHaveBeenCalledWith({
      code: "PROVIDER_FAILURE",
      message: "Sync command failed (permanentProviderError)",
      retryable: true,
    });
  });

  it("maps unsupportedCapability to 403 UNSUPPORTED_OPERATION (not retryable)", async () => {
    // A provider refusal for this specific event (e.g. Google declining a
    // birthday-occurrence delete) used to share PROVIDER_FAILURE's retryable
    // 502 — a generic error the client could retry forever without success.
    mockSyncCommandFailure("unsupportedCapability");
    const { res, json } = await createViaSync();

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.FORBIDDEN,
    );
    expect(json).toHaveBeenCalledWith({
      code: "UNSUPPORTED_OPERATION",
      message:
        "This calendar doesn't allow this change for this event (for example birthday or holiday events). Try deleting the entire series, or manage it in your calendar.",
      retryable: false,
    });
  });

  // The regression lock for invariant 1 ("every write resolves
  // definitively"): a command sync leaves non-terminal must never read as
  // success here. Before this fix, a still-pending outcome returned 200 —
  // the client applied the change optimistically, then a later refetch
  // silently reverted it with no error ever shown ("my delete came back").
  it("fails a still-pending outcome as a retryable PROVIDER_FAILURE, never as success", async () => {
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      submitCommand: mock(() =>
        Promise.resolve({
          ok: true as const,
          value: { command: { outcome: { state: "pending" as const } } },
        }),
      ),
    } as never);
    const { res, json } = await createViaSync();

    const status = (res.status as ReturnType<typeof mock>).mock.calls[0]?.[0];
    expect(status).not.toBe(200);
    expect(status).toBe(502);
    expect(json).toHaveBeenCalledWith({
      code: "PROVIDER_FAILURE",
      message: "Sync command did not resolve (pending)",
      retryable: true,
    });
  });

  // WP-08: POST /api/event/:id/rsvp. No writable-calendar gate — an RSVP is
  // not a calendar write, so it must succeed without ANY calendar lookup
  // (viewer-access calendars included).
  it("submits an rsvp command and answers 204 without any calendar-writability lookup", async () => {
    const submitCommand = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          command: {
            outcome: {
              state: "confirmed" as const,
              providerEventId: "prov-1",
              providerVersion: "v2",
            },
          },
        },
      }),
    );
    // Deliberately NO listCalendars on the stub: if the handler consulted
    // any writable-calendar gate, this test would throw on the missing
    // method instead of answering 204.
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      submitCommand,
    } as never);

    const { res } = jsonRes();
    const eventId = objectId();
    await eventController.rsvp(
      sessionReq(objectId(), {
        params: { id: eventId },
        body: { responseStatus: "accepted", scope: "single" },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.NO_CONTENT);
    expect(submitCommand).toHaveBeenCalledTimes(1);
    const request = (
      (submitCommand.mock.calls as unknown[][])[0] as never as [
        unknown,
        { eventId: string; input: unknown; idempotencyKey: string },
      ]
    )[1];
    expect(request.eventId).toBe(eventId);
    expect(request.idempotencyKey).toStartWith("rsvp:");
    // Plain id + scope "single" answers the event itself (coerced target).
    expect(request.input).toEqual({
      kind: "rsvp",
      responseStatus: "accepted",
      scope: "all",
      recurrenceId: null,
    });
  });

  it("posts the decoded occurrence target for a scope-single rsvp on a composite id", async () => {
    const submitCommand = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          command: {
            outcome: {
              state: "confirmed" as const,
              providerEventId: "prov-inst-1",
              providerVersion: "v3",
            },
          },
        },
      }),
    );
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      submitCommand,
    } as never);

    const { res } = jsonRes();
    const seriesId = objectId();
    const recurrenceId = "2026-07-21T15:00:00.000Z";
    await eventController.rsvp(
      sessionReq(objectId(), {
        params: {
          id: composeOccurrenceId({ eventId: seriesId, recurrenceId }),
        },
        body: { responseStatus: "declined", scope: "single" },
      }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(Status.NO_CONTENT);
    const request = (
      (submitCommand.mock.calls as unknown[][])[0] as never as [
        unknown,
        { eventId: string; input: unknown },
      ]
    )[1];
    // The series id + the occurrence's recurrenceId — never the whole series.
    expect(request.eventId).toBe(seriesId);
    expect(request.input).toEqual({
      kind: "rsvp",
      responseStatus: "declined",
      scope: "this",
      recurrenceId,
    });
  });

  it("rejects an rsvp of needsAction as 400 INVALID_INPUT with no sync call", async () => {
    const submitCommand = mock();
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      submitCommand,
    } as never);

    const { res, json } = jsonRes();
    await eventController.rsvp(
      sessionReq(objectId(), {
        params: { id: objectId() },
        // A user answers, they don't un-answer: needsAction is never a
        // choosable response.
        body: { responseStatus: "needsAction", scope: "single" },
      }),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.BAD_REQUEST,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INVALID_INPUT", retryable: false }),
    );
    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("maps a typed rsvp refusal (unsupportedCapability) to 403 UNSUPPORTED_OPERATION", async () => {
    // E.g. the caller is not in the event's attendee list, or the connection
    // cannot be verified — sync fails the command typed; never a retryable
    // 502.
    mockSyncCommandFailure("unsupportedCapability");

    const { res, json } = jsonRes();
    await eventController.rsvp(
      sessionReq(objectId(), {
        params: { id: objectId() },
        body: { responseStatus: "tentative", scope: "all" },
      }),
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.FORBIDDEN,
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "UNSUPPORTED_OPERATION",
        retryable: false,
      }),
    );
  });

  it("rejects delete-all when the session user does not match :userId", async () => {
    const deleteSpy = spyOn(
      (await import("@backend/event/services/event.service")).default,
      "deleteAllByUser",
    );
    const { res, json } = jsonRes();
    const sessionUser = objectId();
    const otherUser = objectId();

    await eventController.deleteAllByUser(
      sessionReq(sessionUser, { params: { userId: otherUser } }),
      res,
    );

    expect(deleteSpy).not.toHaveBeenCalled();
    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.BAD_REQUEST,
    );
    expect(json).toHaveBeenCalledWith({
      code: "INVALID_INPUT",
      message: "Cannot delete events for another user",
      retryable: false,
    });
  });
});

// This controller answers every error through `send`, which never reaches the
// global error handler — so `send` is the only place an event failure gets
// logged, for reads and writes alike, and PostHogExceptionTransport only
// listens at `error`.
describe("logLevelForEventFailure", () => {
  // Normal outcomes of a user action. Logging these would file exceptions for
  // everyday misses and bury the real defects.
  it.each([
    ["EVENT_NOT_FOUND", Status.NOT_FOUND],
    ["INVALID_INPUT", Status.BAD_REQUEST],
    ["CALENDAR_READ_ONLY", Status.FORBIDDEN],
    ["GOOGLE_REVOKED", Status.GONE],
    ["RECURRENCE_CONFLICT", Status.CONFLICT],
  ] as const)("does not log %s (%d)", (_code, status) => {
    expect(logLevelForEventFailure(status)).toBeUndefined();
  });

  // Mutations already split 503/502 by kind, so their status carries the
  // operational-vs-defect distinction on its own.
  it("keeps a mutation SYNC_UNAVAILABLE (503) at warn", () => {
    expect(logLevelForEventFailure(Status.SERVICE_UNAVAILABLE)).toBe("warn");
  });

  it.each([
    ["PROVIDER_FAILURE", 502 as Status],
    ["unmapped failure", Status.INTERNAL_SERVER],
  ] as const)("reports a mutation %s at error", (_label, status) => {
    expect(logLevelForEventFailure(status)).toBe("error");
  });

  // The read path answers EVERY Sync kind with PROVIDER_FAILURE (502), so its
  // status alone would report a Sync restart as a defect. The kind decides.
  it("keeps a read failure at warn when Sync was merely unavailable", () => {
    expect(
      logLevelForEventFailure(502 as Status, {
        kind: "unavailable",
        correlationId: "corr-1",
      }),
    ).toBe("warn");
  });

  it("reports a read failure at error when Sync rejected the query", () => {
    // The 2026-08-25 >20-calendar outage: badRequest behind a 502.
    expect(
      logLevelForEventFailure(502 as Status, {
        kind: "badRequest",
        status: 400,
        correlationId: "corr-2",
      }),
    ).toBe("error");
  });
});

describe("syncFailureLogContext", () => {
  it("adds nothing when the failure did not come from Sync", () => {
    expect(syncFailureLogContext()).toBe("");
  });

  it("names the kind, status and correlation id", () => {
    expect(
      syncFailureLogContext({
        kind: "unexpectedStatus",
        status: 500,
        correlationId: "corr-1",
      }),
    ).toBe(" (unexpectedStatus) [status=500] [correlationId=corr-1]");
  });

  // The point of the fix. Issue #2901 fired seven times reporting only that a
  // 200 body failed the contract, never which field failed it, because this
  // line dropped the detail #2900 had already collected.
  it("names the field a rejected 200 body broke", () => {
    expect(
      syncFailureLogContext({
        kind: "invalidResponse",
        status: 200,
        correlationId: "corr-2",
        detail:
          "issues=<root>: unrecognized_keys [addedByNewerSync]; " +
          "keys=instances,nextCursor; content-type=application/json",
      }),
    ).toBe(
      " (invalidResponse) [status=200] [correlationId=corr-2] " +
        "issues=<root>: unrecognized_keys [addedByNewerSync]; " +
        "keys=instances,nextCursor; content-type=application/json",
    );
  });
});

describe("EventMutationException syncError", () => {
  it("carries the Sync failure without leaking it to the client", () => {
    const e = eventMutationError("PROVIDER_FAILURE", "Failed to list events", {
      kind: "badRequest",
      status: 400,
      correlationId: "corr-secret",
    });

    expect(e.syncError?.kind).toBe("badRequest");

    // The correlation id must stay out of the response: it is per-request, and
    // the browser has no use for it.
    const { body } = toEventMutationError(e);
    expect(body).toEqual({
      code: "PROVIDER_FAILURE",
      message: "Failed to list events",
      retryable: true,
    });
  });
});
