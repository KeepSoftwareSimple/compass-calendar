import { type SessionRequest } from "supertokens-node/framework/express";
import { type CalendarListResponse } from "@core/types/calendar.contracts";
import { BusyPeriodSchema } from "@core/types/event.contracts";
import {
  type AvailabilityQuery,
  AvailabilityQuerySchema,
  type AvailabilityResponse,
} from "@core/types/event-command.contracts";
import { SyncEventCalendarIdSchema } from "@core/types/sync/event.contracts";
import { zObjectId } from "@core/types/type.utils";
import { mapCalendarRecord } from "@backend/calendar/calendar.record.mapper";
import calendarService from "@backend/calendar/services/calendar.service";
import { AuthError } from "@backend/common/errors/auth/auth.errors";
import { GenericError } from "@backend/common/errors/generic/generic.errors";
import { error } from "@backend/common/errors/handlers/error.handler";
import { parseCommaSeparatedQueryParam } from "@backend/common/helpers/query-param";
import { syncCalendarsToBrowser } from "@backend/common/services/sync-service/calendar-list.translation";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { throwSyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { type Res_Promise } from "@backend/common/types/express.types";

// Availability is display-only decoration here (inert busy blocks on the
// grid, not a booking decision), so a generous freshness tolerance avoids
// flagging normal sync latency as stale. Sync still returns intervals past
// this age — see busy-query.service.ts — this only affects the `complete`/
// `bookable` flags, which this display-only caller doesn't act on.
const AVAILABILITY_DISPLAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// A7 "bounded": AvailabilityQuerySchema (core) only enforces end > start, not
// a maximum span - an unbounded range would let one request fan a Google
// freebusy call out across an arbitrary window. Kept as a small local check
// rather than a core-contract change (packet 08 phase 4).
const MAX_AVAILABILITY_RANGE_DAYS = 62;

const assertBoundedAvailabilityRange = (query: AvailabilityQuery) => {
  const rangeMs = Date.parse(query.end) - Date.parse(query.start);
  const maxMs = MAX_AVAILABILITY_RANGE_DAYS * 24 * 60 * 60 * 1000;

  if (rangeMs > maxMs) {
    throw error(
      GenericError.BadRequest,
      `Availability range must not exceed ${MAX_AVAILABILITY_RANGE_DAYS} days`,
    );
  }
};

const parseAvailabilityQuery = (query: SessionRequest["query"]) => {
  const calendarIds = parseCommaSeparatedQueryParam(query["calendarIds"]);

  return AvailabilityQuerySchema.parse({
    calendarIds: calendarIds ?? [],
    start: query["start"],
    end: query["end"],
  });
};

// List the caller's calendars from the sync service and translate them to the
// browser Calendar contract. The connection list rides along (both are cheap
// passive-mode reads on the same service) so each calendar can carry its
// owning account's email — sync's ProviderCalendar only has a connectionId.
// A sync failure on either call rejects (rather than returning an empty or
// email-less list) so the browser surfaces a load error and retries, instead
// of silently hiding every calendar.
const listCalendarsFromSync = async (
  userId: string,
): Promise<CalendarListResponse> => {
  const client = getSyncServiceClient();
  const principal = toSyncPrincipal(userId);
  const [calendarsResult, connectionsResult] = await Promise.all([
    client.listCalendars(principal),
    client.listConnections(principal),
  ]);
  if (!calendarsResult.ok) {
    throwSyncProxyFailure(
      calendarsResult.error.kind,
      `Failed to list calendars from sync (${calendarsResult.error.kind})`,
      calendarsResult.error.detail,
    );
  }
  if (!connectionsResult.ok) {
    throwSyncProxyFailure(
      connectionsResult.error.kind,
      `Failed to list connections from sync (${connectionsResult.error.kind})`,
      connectionsResult.error.detail,
    );
  }

  return {
    calendars: syncCalendarsToBrowser(
      calendarsResult.value.calendars,
      connectionsResult.value.connections,
    ),
  };
};

// Busy time from the sync service, translated to the browser's per-calendar
// AvailabilityResponse contract. Sync returns a merged interval list plus a
// `byCalendar` grouping so one request can paint every column without losing
// source calendar attribution.
const getAvailabilityFromSync = async (
  userId: string,
  query: AvailabilityQuery,
): Promise<AvailabilityResponse> => {
  const client = getSyncServiceClient();
  const principal = toSyncPrincipal(userId);

  const result = await client.queryBusyAvailability(principal, {
    calendarIds: query.calendarIds.map((calendarId) =>
      SyncEventCalendarIdSchema.parse(calendarId),
    ),
    start: query.start,
    end: query.end,
    maxAgeMs: AVAILABILITY_DISPLAY_MAX_AGE_MS,
    purpose: "display",
  });
  if (!result.ok) {
    throwSyncProxyFailure(
      result.error.kind,
      `Failed to query availability from sync (${result.error.kind})`,
      result.error.detail,
    );
  }

  return {
    busyPeriods: query.calendarIds.flatMap((calendarId) =>
      (result.value.byCalendar[calendarId] ?? []).map((interval) =>
        BusyPeriodSchema.parse({
          calendarId,
          start: interval.start,
          end: interval.end,
        }),
      ),
    ),
  };
};

class CalendarController {
  list = async (req: SessionRequest, res: Res_Promise) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId(), {
        error: () => error(AuthError.InadequatePermissions, "List Failed"),
      });

      const [syncResponse, localCalendar] = await Promise.all([
        listCalendarsFromSync(userId.toString()),
        calendarService.getLocalCalendar(userId),
      ]);

      res.promise({
        calendars: localCalendar
          ? [...syncResponse.calendars, mapCalendarRecord(localCalendar)]
          : syncResponse.calendars,
      });
    } catch (e) {
      res.promise(Promise.reject(e));
    }
  };

  availability = async (req: SessionRequest, res: Res_Promise) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId(), {
        error: () =>
          error(AuthError.InadequatePermissions, "Availability Failed"),
      });

      const query = parseAvailabilityQuery(req.query);
      assertBoundedAvailabilityRange(query);

      const response = await getAvailabilityFromSync(userId.toString(), query);

      res.promise(response);
    } catch (e) {
      res.promise(Promise.reject(e));
    }
  };
}

export default new CalendarController();
