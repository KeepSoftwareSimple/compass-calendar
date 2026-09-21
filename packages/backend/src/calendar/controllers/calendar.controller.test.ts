import { faker } from "@faker-js/faker";
import { type SessionRequest } from "supertokens-node/framework/express";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { CalendarListResponseSchema } from "@core/types/calendar.contracts";
import { restoreFileMocks } from "@backend/__tests__/helpers/mock.setup";
import calendarController from "@backend/calendar/controllers/calendar.controller";
import calendarService from "@backend/calendar/services/calendar.service";
import { CONFIG } from "@backend/common/constants/config.constants";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import { type Res_Promise } from "@backend/common/types/express.types";
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

// Capture the promise the controller hands to res.promise so the test can
// observe whether it resolved or rejected.
const capturingRes = () => {
  let settled: Promise<unknown> | undefined;
  const res = {
    promise: (value: unknown) => {
      settled = Promise.resolve(value);
    },
  } as unknown as Res_Promise;
  return { res, settled: () => settled };
};

// These exercise calendarController.availability directly against fake
// req/res objects (no supertest), mirroring events.controller.test.ts - the
// route itself is a one-line wire-up (calendar.routes.config.ts). The A7
// 62-day bound is enforced in the controller before any sync call, so it's
// pinned here independent of which service backs the request.

describe("CalendarController availability", () => {
  const userId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    restoreFileMocks();
  });

  const buildReq = (query: Record<string, string>): SessionRequest =>
    ({
      query,
      session: { getUserId: () => userId },
    }) as unknown as SessionRequest;

  const buildRes = () => {
    const promise = mock();
    return { promise } as unknown as Res_Promise;
  };

  it("rejects a range longer than 62 days with a 400, without querying sync (A7 bounded)", async () => {
    const clientSpy = spyOn(syncServiceFactory, "getSyncServiceClient");

    const req = buildReq({
      calendarIds: "507f1f77bcf86cd799439012",
      start: "2024-01-01T00:00:00.000Z",
      end: "2024-05-01T00:00:00.000Z", // ~121 days, well past the 62-day bound
    });
    const res = buildRes();

    await calendarController.availability(req, res);

    expect(clientSpy).not.toHaveBeenCalled();
    expect(res.promise).toHaveBeenCalledTimes(1);

    const rejection = (res.promise as Mock).mock
      .calls[0]?.[0] as Promise<unknown>;
    await expect(rejection).rejects.toBeInstanceOf(BaseError);
    await rejection.catch((e) => {
      expect((e as BaseError).statusCode).toBe(Status.BAD_REQUEST);
      // `error()`'s second arg lands on `.result`, not `.message` (the first
      // arg's `.description` does) - see error.handler.ts.
      expect((e as BaseError).result).toMatch(/62 days/i);
    });

    clientSpy.mockRestore();
  });
});

// No prior test in this file exercised calendarController.list (GET
// /api/calendars) at all; this pins its happy path plus the packet 09 step 2
// response-boundary parse, using the same fake req/res driver as the
// describe block above.
describe("CalendarController list", () => {
  const userId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    restoreFileMocks();
  });

  it("returns a CalendarListResponse-shaped body for the session user's calendars", async () => {
    const listCalendars = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          calendars: [
            {
              id: "507f1f77bcf86cd799439099",
              tenantId: userId,
              principalId: userId,
              connectionId: "507f1f77bcf86cd799439098",
              providerCalendarId: "gcal-1",
              displayName: "Work",
              color: "#000000",
              active: true,
              primary: true,
              accessRole: "owner" as const,
              capabilities: {
                canWriteEvents: true,
                canReadBusy: true,
                canInviteAttendees: true,
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: "507f1f77bcf86cd799439097",
              tenantId: userId,
              principalId: userId,
              connectionId: "507f1f77bcf86cd799439096",
              providerCalendarId: "gcal-2",
              displayName: "Personal",
              color: "#000000",
              active: true,
              primary: false,
              accessRole: "owner" as const,
              capabilities: {
                canWriteEvents: true,
                canReadBusy: true,
                canInviteAttendees: true,
              },
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
        },
      }),
    );
    // The controller joins each calendar to its owning connection's account
    // email by connectionId; the second connection reported no email, so its
    // calendar must omit accountEmail rather than carry null/empty.
    const listConnections = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          connections: [
            {
              id: "507f1f77bcf86cd799439098",
              account: { email: "bob@acme.co" },
            },
            { id: "507f1f77bcf86cd799439096", account: { email: null } },
          ],
        },
      }),
    );
    const clientSpy = spyOn(
      syncServiceFactory,
      "getSyncServiceClient",
    ).mockReturnValue({ listCalendars, listConnections } as never);
    // Not a .db.test.ts file, so there's no real Mongo connection here —
    // getLocalCalendar's own findOne would throw ("did you forget to call
    // `start`?") without this.
    const localCalendarSpy = spyOn(
      calendarService,
      "getLocalCalendar",
    ).mockResolvedValue(null);

    const req = {
      query: {},
      session: { getUserId: () => userId },
    } as unknown as SessionRequest;
    const promise = mock();
    const res = { promise } as unknown as Res_Promise;

    await calendarController.list(req, res);

    expect(listCalendars).toHaveBeenCalledTimes(1);
    expect(listConnections).toHaveBeenCalledTimes(1);
    expect(promise).toHaveBeenCalledTimes(1);

    const sentBody = promise.mock.calls[0]?.[0];
    expect(() => CalendarListResponseSchema.parse(sentBody)).not.toThrow();

    const parsed = CalendarListResponseSchema.parse(sentBody);
    expect(parsed.calendars[0]?.accountEmail).toBe("bob@acme.co");
    expect(parsed.calendars[1] && "accountEmail" in parsed.calendars[1]).toBe(
      false,
    );

    clientSpy.mockRestore();
    localCalendarSpy.mockRestore();
  });

  it("fails closed on a sync outage rather than silently returning an empty list", async () => {
    // Point at an unreachable sync service so the read fails at the fetch,
    // proving list() fails closed instead of silently returning []. This
    // file shares a process with the rest of the suite, so the lazy sync
    // client singleton is built from these values the first time a test
    // here needs a live (non-mocked) client.
    const originalServiceUrl = CONFIG.SYNC_SERVICE_URL;
    const originalToken = CONFIG.SYNC_INTERNAL_AUTH_TOKEN;
    CONFIG.SYNC_SERVICE_URL = "http://sync.invalid:4999";
    CONFIG.SYNC_INTERNAL_AUTH_TOKEN = "test-sync-secret";

    const { res, settled } = capturingRes();
    await calendarController.list(
      { query: {}, session: { getUserId: () => objectId() } } as SessionRequest,
      res,
    );

    await expect(settled()).rejects.toThrow();

    CONFIG.SYNC_SERVICE_URL = originalServiceUrl;
    CONFIG.SYNC_INTERNAL_AUTH_TOKEN = originalToken;
  });
});

describe("CalendarController.availability sync outage", () => {
  const originalServiceUrl = CONFIG.SYNC_SERVICE_URL;
  const originalToken = CONFIG.SYNC_INTERNAL_AUTH_TOKEN;

  const availabilityReqFor = (userId: string, calendarIds: string[]) =>
    ({
      session: { getUserId: () => userId },
      query: {
        calendarIds: calendarIds.join(","),
        start: "2026-07-14T00:00:00.000Z",
        end: "2026-07-14T23:59:59.000Z",
      },
    }) as unknown as SessionRequest;

  afterEach(() => {
    CONFIG.SYNC_SERVICE_URL = originalServiceUrl;
    CONFIG.SYNC_INTERNAL_AUTH_TOKEN = originalToken;
    mock.restore();
  });

  it("fails closed on a sync outage (no silent empty response)", async () => {
    CONFIG.SYNC_SERVICE_URL = "http://sync.invalid:4999";
    CONFIG.SYNC_INTERNAL_AUTH_TOKEN = "test-sync-secret";

    const { res, settled } = capturingRes();
    await calendarController.availability(
      availabilityReqFor(objectId(), [objectId()]),
      res,
    );

    await expect(settled()).rejects.toThrow();
  });

  it("queries every calendar in one Sync call and keeps each interval's calendarId", async () => {
    const [first, second, third] = [objectId(), objectId(), objectId()];
    const queryBusyAvailability = mock(() =>
      Promise.resolve({
        ok: true as const,
        value: {
          intervals: [],
          byCalendar: [
            {
              calendarId: first,
              intervals: [
                {
                  start: "2026-07-14T09:00:00.000Z",
                  end: "2026-07-14T10:00:00.000Z",
                },
              ],
            },
            { calendarId: second, intervals: [] },
            {
              calendarId: third,
              intervals: [
                {
                  start: "2026-07-14T14:00:00.000Z",
                  end: "2026-07-14T15:00:00.000Z",
                },
              ],
            },
          ],
          computedAt: "2026-07-14T08:00:00.000Z",
          connections: [],
          complete: true,
          issues: [],
          bookable: true,
        },
      }),
    );
    spyOn(syncServiceFactory, "getSyncServiceClient").mockReturnValue({
      queryBusyAvailability,
    } as never);

    const { res, settled } = capturingRes();
    await calendarController.availability(
      availabilityReqFor(objectId(), [first, second, third]),
      res,
    );

    expect(queryBusyAvailability).toHaveBeenCalledTimes(1);
    expect(queryBusyAvailability.mock.calls[0]?.[1]).toMatchObject({
      calendarIds: [first, second, third],
    });
    await expect(settled()).resolves.toEqual({
      busyPeriods: [
        {
          calendarId: first,
          start: "2026-07-14T09:00:00.000Z",
          end: "2026-07-14T10:00:00.000Z",
        },
        {
          calendarId: third,
          start: "2026-07-14T14:00:00.000Z",
          end: "2026-07-14T15:00:00.000Z",
        },
      ],
    });
  });
});
