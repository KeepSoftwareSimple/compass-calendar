import { type Request, type Response } from "express";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  type CreateEventInput,
  CreateEventInputSchema,
  type DeleteEventInput,
  DeleteEventInputSchema,
  type EventListQuery,
  EventListQuerySchema,
  type ReplaceEventInput,
  ReplaceEventInputSchema,
  type RsvpEventInput,
  RsvpEventInputSchema,
} from "@core/types/event-command.contracts";
import {
  type CommandSubmitRequest,
  type SyncCommandFailureReason,
} from "@core/types/sync/command.contracts";
import {
  type EventInstanceListQuery,
  type SyncEventCalendarId,
  SyncEventCalendarIdSchema,
} from "@core/types/sync/event.contracts";
import { assertBillingAllowsWrites } from "@backend/billing/billing.guard";
import calendarService from "@backend/calendar/services/calendar.service";
import { assertCloudMutationsAllowed } from "@backend/common/services/sync-service/cloud-mutation-mode";
import {
  toCreateSubmitRequest,
  toDeleteSubmitRequest,
  toReplaceSubmitRequests,
  toRsvpSubmitRequest,
} from "@backend/common/services/sync-service/event-command.translation";
import { syncEventInstanceToBrowser } from "@backend/common/services/sync-service/event-list.translation";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import {
  logLevelForSyncClientError,
  throwSyncCommandSubmitFailure,
} from "@backend/common/services/sync-service/sync-proxy-error";
import {
  type SyncClientError,
  type SyncServiceClient,
} from "@backend/common/services/sync-service/sync-service.client";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import {
  EventMutationException,
  eventMutationError,
  toEventMutationError,
} from "@backend/event/event.error";
import eventService from "@backend/event/services/event.service";

const logger = Logger("app:event.controller");

// Every handler in this controller answers through `send`, which writes the
// response directly and never reaches the global error handler — so unlike
// the proxy routes (unwrap-sync-result), nothing downstream logs the
// exception. This is the only place an event read OR write failure can be
// recorded, and PostHogExceptionTransport only listens at `error`, so a
// defect logged any quieter is never captured: that is how the 2026-08-25
// >20-calendar outage ran for a day with no error-tracking issue.
//
// Below 500 stays unlogged. A missing event, invalid input, a read-only
// calendar or revoked Google grant is a normal outcome of a user action, not
// a defect, and filing those as exceptions would bury the real ones.
// Exported for tests: the level decision is the part worth pinning, and the
// module-level `logger` cannot be spied on from a test (Logger() builds a new
// winston instance per call).
export const logLevelForEventFailure = (
  status: Status,
  syncError?: SyncClientError,
): "warn" | "error" | undefined => {
  if (status < Status.INTERNAL_SERVER) return undefined;
  // Prefer the Sync failure kind when there is one: the read path answers
  // every kind with PROVIDER_FAILURE (502), so its status cannot distinguish
  // a Sync restart from a defect. Mutations already split 503/502 by kind
  // (throwSyncCommandSubmitFailure), so status alone is right for them.
  if (syncError) return logLevelForSyncClientError(syncError.kind);
  return status === Status.SERVICE_UNAVAILABLE ? "warn" : "error";
};

// The Sync-failure context appended to the logged message, never to `body`.
// The correlation id goes here rather than into `body.message`: PostHog groups
// issues by the message, so a per-request id in it would split one defect into
// an issue per occurrence.
//
// `detail` is the log-safe SyncClientError.detail: the failing Zod field paths
// with their issue code, the body's top-level keys, and the content-type —
// field names and codes only, never a field value. Without it an
// `invalidResponse` reports only that the contract broke, not which field
// broke it, which is how issue #2901 stayed undiagnosable through seven
// occurrences. `unwrap-sync-result` already appends it on the proxy routes;
// this is the same line for the event routes, which reach neither
// `unwrapSyncResult` nor `throwSyncProxyFailure`.
//
// Exported for tests, for the same reason logLevelForEventFailure is: the
// module-level `logger` cannot be spied on.
export const syncFailureLogContext = (syncError?: SyncClientError): string => {
  if (!syncError) return "";
  return (
    ` (${syncError.kind}) [status=${syncError.status}] ` +
    `[correlationId=${syncError.correlationId}]` +
    (syncError.detail ? ` ${syncError.detail}` : "")
  );
};

const send = (res: Response, e: unknown) => {
  const { status, body } = toEventMutationError(e);
  const syncError =
    e instanceof EventMutationException ? e.syncError : undefined;
  const level = logLevelForEventFailure(status, syncError);

  if (level) {
    logger[level](
      `${body.code}: ${body.message}${syncFailureLogContext(syncError)}`,
    );
  }

  res.status(status).json(body);
};

const parseListQuery = (query: Request["query"]): EventListQuery => {
  const calendarIdsParam = query["calendarIds"];
  const calendarIds =
    typeof calendarIdsParam === "string" && calendarIdsParam.length > 0
      ? calendarIdsParam.split(",")
      : undefined;

  return EventListQuerySchema.parse({
    kind: "range",
    start: query["start"],
    end: query["end"],
    ...(calendarIds !== undefined ? { calendarIds } : {}),
  });
};

// Resolve every calendar the principal owns under sync delegation: provider
// calendars from sync, plus the Compass-native local calendar (local-first
// events are keyed by its legacy CalendarId). When the client passes
// `calendarIds`, intersect with owned ids so hidden calendars are never
// drained (and unowned ids cannot be probed). Empty means the user has
// nothing to read yet; return [] rather than calling sync with an invalid
// empty calendarIds. Scoped to ACTIVE calendars only: a calendar the provider
// no longer lists must never be read from (nor silently included when the
// client sends no calendarIds at all, which happens while the browser's own
// calendar list is still loading).
const resolveSyncCalendarIds = async (
  client: SyncServiceClient,
  userId: string,
  requestedIds?: readonly string[],
): Promise<SyncEventCalendarId[]> => {
  const principal = toSyncPrincipal(userId);
  const [calendarsResult, localCalendar] = await Promise.all([
    client.listCalendars(principal, { activeOnly: true }),
    calendarService.getLocalCalendar(userId),
  ]);

  if (!calendarsResult.ok) {
    throw eventMutationError(
      "PROVIDER_FAILURE",
      `Failed to list calendars from sync (${calendarsResult.error.kind})`,
      calendarsResult.error,
    );
  }

  const ids: SyncEventCalendarId[] = [
    ...calendarsResult.value.calendars.map((c) => c.id),
  ];
  if (localCalendar) {
    ids.push(SyncEventCalendarIdSchema.parse(localCalendar._id.toHexString()));
  }

  if (requestedIds === undefined) {
    return ids;
  }

  const owned = new Set(ids);
  return requestedIds
    .filter((id) => owned.has(id as SyncEventCalendarId))
    .map((id) => SyncEventCalendarIdSchema.parse(id));
};

// Drain every page of full-fidelity instances for the range. Sync pages at
// most 500; legacy readAll was unbounded within the view window, so we follow
// nextCursor until exhausted. Horizon note: sync clamps 12mo past / 18mo
// future — the browser only views inside that window.
const listAllFullEvents = async (
  client: SyncServiceClient,
  userId: string,
  query: EventListQuery,
  calendarIds: readonly SyncEventCalendarId[],
) => {
  const principal = toSyncPrincipal(userId);
  const instances = [];
  let cursor: string | undefined;

  for (;;) {
    const pageQuery: EventInstanceListQuery = {
      calendarIds,
      start: query.start,
      end: query.end,
      ...(cursor !== undefined ? { cursor } : {}),
    };
    const result = await client.listFullEvents(principal, pageQuery);
    if (!result.ok) {
      throw eventMutationError(
        "PROVIDER_FAILURE",
        `Failed to list events from sync (${result.error.kind})`,
        result.error,
      );
    }
    instances.push(...result.value.instances);
    if (result.value.nextCursor === null) break;
    cursor = result.value.nextCursor;
  }

  return instances;
};

// GET /api/event when event routing delegates to sync: fetch full-fidelity
// instances from sync and translate to the browser Event contract.
// Fail-closed — a sync outage surfaces as an error rather than silently
// falling back to legacy (which would show a different, stale store).
const readAllFromSync = async (userId: string, query: EventListQuery) => {
  const client = getSyncServiceClient();
  const calendarIds = await resolveSyncCalendarIds(
    client,
    userId,
    query.calendarIds,
  );
  if (calendarIds.length === 0) return [];

  const instances = await listAllFullEvents(client, userId, query, calendarIds);
  return instances.map(syncEventInstanceToBrowser);
};

// Gate for guest-list edits (`content.attendees` present): only a writable
// Google calendar can deliver a guest list, so anything else — the Compass
// local calendar, a read-only Google calendar, an unknown id — is a typed
// refusal BEFORE any command is submitted. Reuses the same sync calendar
// lookup the read path performs (active calendars only; the local calendar is
// never in sync's list, so it fails the membership check by construction).
//
// `calendarId` is the create path's exact target. A replace carries no
// calendarId (cross-calendar moves are rejected before this), so the check
// degrades to "the principal has at least one writable calendar that can
// invite attendees": the browser only offers the editor on the event's own
// writable inviting calendar (WP-04) and sync's organizer guard refuses
// per-event misuse, so this coarser backstop is about local-only/read-only
// accounts, not routing.
const assertAttendeesSupported = async (
  client: SyncServiceClient,
  userId: string,
  calendarId?: string,
) => {
  const result = await client.listCalendars(toSyncPrincipal(userId), {
    activeOnly: true,
  });
  if (!result.ok) {
    throw eventMutationError(
      "PROVIDER_FAILURE",
      `Failed to list calendars from sync (${result.error.kind})`,
      result.error,
    );
  }

  const supported = result.value.calendars.some(
    (calendar) =>
      calendar.capabilities.canWriteEvents &&
      (calendarId === undefined || calendar.id === calendarId),
  );
  if (!supported) {
    throw eventMutationError(
      "ATTENDEES_UNSUPPORTED",
      "Guests can only be added to events on a writable calendar that can invite attendees",
    );
  }
};

const mapSyncFailure = (reason: SyncCommandFailureReason) => {
  switch (reason) {
    case "readOnlyCalendar":
      return eventMutationError("CALENDAR_READ_ONLY", "Calendar is read-only");
    case "versionConflict":
      return eventMutationError(
        "RECURRENCE_CONFLICT",
        "Event was modified elsewhere",
      );
    case "authorizationRevoked":
      return eventMutationError(
        "GOOGLE_REVOKED",
        "Calendar access expired or was revoked. Reconnect your calendar in Compass to resume syncing.",
      );
    case "unsupportedCapability":
      // The provider declined the operation for this specific event (e.g.
      // Google rejects deleting one occurrence of a contact-linked birthday
      // event). Retrying can never succeed, so this must not share
      // PROVIDER_FAILURE's retryable 502.
      return eventMutationError(
        "UNSUPPORTED_OPERATION",
        "This calendar doesn't allow this change for this event (for example birthday or holiday events). Try deleting the entire series, or manage it in your calendar.",
      );
    case "permanentProviderError":
      return eventMutationError(
        "PROVIDER_FAILURE",
        `Sync command failed (${reason})`,
      );
  }
};

// Submit one command. Never falls back to the legacy store — a timeout or
// unavailable response may already have been accepted by sync, so retrying
// via eventService would duplicate the write.
const submitCommandOrThrow = async (
  client: SyncServiceClient,
  userId: string,
  request: CommandSubmitRequest,
) => {
  const result = await client.submitCommand(toSyncPrincipal(userId), request);
  if (!result.ok) {
    // Timeout/unavailable can mean Sync already accepted (or finished) the
    // mutation — especially provider deletes, which run inline. Do not fall
    // back to legacy; surface a retryable provider failure instead.
    throwSyncCommandSubmitFailure(result.error.kind);
  }

  const { outcome } = result.value.command;
  if (outcome.state === "failed") {
    throw mapSyncFailure(outcome.failureReason);
  }
  if (outcome.state === "cancelled") {
    throw eventMutationError("PROVIDER_FAILURE", "Sync command was cancelled");
  }
  // Backstop for invariant 1 ("every write resolves definitively"): a
  // command that is still pending/applying/reconciling has NOT actually
  // applied anywhere. Sync's stale-command retry sweep revisits
  // create/update/delete after the stale window, but this request must not
  // report success while the command is still non-terminal — the client
  // would optimistically apply the change, then a later refetch could
  // revert it with no error ever shown. Every known path that could leave a
  // command non-terminal already throws explicitly instead
  // (ProviderWriteUnavailableError, failCloud); this is the safety net for
  // any path that doesn't, today or in the future.
  if (outcome.state !== "confirmed") {
    throw eventMutationError(
      "PROVIDER_FAILURE",
      `Sync command did not resolve (${outcome.state})`,
    );
  }
  return result.value.command;
};

const createFromSync = async (userId: string, input: CreateEventInput) => {
  const client = getSyncServiceClient();
  if (input.content.attendees !== undefined) {
    await assertAttendeesSupported(client, userId, input.calendarId);
  }
  const { request, responseEvent } = toCreateSubmitRequest(input);
  await submitCommandOrThrow(client, userId, request);
  return responseEvent;
};

const replaceFromSync = async (
  userId: string,
  eventId: string,
  input: ReplaceEventInput,
) => {
  // toReplaceSubmitRequests builds an update command, plus a move command
  // when calendarId is present — but Sync unconditionally fails every move
  // command (no executor exists). Submitting them in sequence would apply
  // the update, THEN throw on the move: a partial write the caller sees as a
  // single failed request, and a naive retry re-runs the same broken pair.
  // Reject up front, before anything is submitted.
  if (input.calendarId !== undefined) {
    throw eventMutationError(
      "MOVE_UNSUPPORTED",
      "Moving an event to a different calendar is not supported yet",
    );
  }

  const client = getSyncServiceClient();
  if (input.content.attendees !== undefined) {
    await assertAttendeesSupported(client, userId);
  }
  const { requests, responseEvent } = toReplaceSubmitRequests(eventId, input);
  for (const request of requests) {
    await submitCommandOrThrow(client, userId, request);
  }
  return responseEvent;
};

// RSVP: answer an invitation on the addressed event (or its whole series).
// Deliberately NO assertAttendeesSupported gate: an RSVP rewrites only the
// caller's own attendee entry and is legitimate on a viewer-access (read-only)
// calendar — it is not a calendar write. Sync's own guards (self must be in
// the attendee list, connection resolvable) are the enforcement; they answer
// with a typed unsupportedCapability that maps to UNSUPPORTED_OPERATION here.
const rsvpFromSync = async (
  userId: string,
  eventId: string,
  input: RsvpEventInput,
) => {
  const client = getSyncServiceClient();
  const request = toRsvpSubmitRequest(eventId, input);
  await submitCommandOrThrow(client, userId, request);
};

const deleteFromSync = async (
  userId: string,
  eventId: string,
  input: DeleteEventInput,
) => {
  const client = getSyncServiceClient();
  const request = toDeleteSubmitRequest(eventId, input);
  await submitCommandOrThrow(client, userId, request);
};

class EventController {
  readAll = async (req: SessionRequest, res: Response) => {
    try {
      const userId = req.session?.getUserId() as string;
      const query = parseListQuery(req.query);
      const events = await readAllFromSync(userId, query);

      res.status(Status.OK).json({ events });
    } catch (e) {
      send(res, e);
    }
  };

  create = async (req: SessionRequest, res: Response) => {
    try {
      assertCloudMutationsAllowed();
      const userId = req.session?.getUserId() as string;
      await assertBillingAllowsWrites(userId);
      const input = CreateEventInputSchema.parse(req.body);
      const event = await createFromSync(userId, input);

      res.status(Status.OK).json({ event });
    } catch (e) {
      send(res, e);
    }
  };

  replace = async (req: SessionRequest, res: Response) => {
    try {
      assertCloudMutationsAllowed();
      const userId = req.session?.getUserId() as string;
      await assertBillingAllowsWrites(userId);
      const eventId = req.params["id"] as string;
      const input = ReplaceEventInputSchema.parse(req.body);
      const event = await replaceFromSync(userId, eventId, input);

      res.status(Status.OK).json({ event });
    } catch (e) {
      send(res, e);
    }
  };

  // POST /api/event/:id/rsvp — auth/billing/maintenance parity with the
  // other event writes above, minus any calendar-writability gate (finish
  // line 5: RSVP is allowed on viewer-access calendars). The sync command
  // result carries no event content and the sync client has no event-by-id
  // lookup, so the response is 204: the web is optimistic and settles the
  // provider-confirmed list via SSE, the same way it discards the
  // synthesized bodies of create/replace.
  rsvp = async (req: SessionRequest, res: Response) => {
    try {
      assertCloudMutationsAllowed();
      const userId = req.session?.getUserId() as string;
      await assertBillingAllowsWrites(userId);
      const eventId = req.params["id"] as string;
      // Strict parse: an invalid responseStatus (incl. "needsAction" — a user
      // answers, they don't un-answer) or scope is a 400 INVALID_INPUT with
      // no sync call.
      const input = RsvpEventInputSchema.parse(req.body);
      await rsvpFromSync(userId, eventId, input);

      res.status(Status.NO_CONTENT).send();
    } catch (e) {
      send(res, e);
    }
  };

  delete = async (req: SessionRequest, res: Response) => {
    try {
      assertCloudMutationsAllowed();
      const userId = req.session?.getUserId() as string;
      await assertBillingAllowsWrites(userId);
      const eventId = req.params["id"] as string;
      const scopeParam = req.query["scope"];
      // DELETE has no body, so the save-time invitation choice (whether
      // Google emails attendees the cancellation) rides the query string.
      // Absent keeps the pre-attendee default of notifying no one.
      const invitationParam = req.query["invitation"];
      const input = DeleteEventInputSchema.parse({
        scope: typeof scopeParam === "string" ? scopeParam : "this",
        ...(typeof invitationParam === "string"
          ? { invitation: invitationParam }
          : {}),
      });

      await deleteFromSync(userId, eventId, input);

      res.status(Status.NO_CONTENT).send();
    } catch (e) {
      send(res, e);
    }
  };

  deleteAllByUser = async (req: SessionRequest, res: Response) => {
    try {
      const userToRemove = req.params["userId"] as string;
      const sessionUserId = req.session?.getUserId();
      // Defense in depth: even while verifyIsDev gates this route, never let
      // a session wipe another user's events.
      if (!sessionUserId || sessionUserId !== userToRemove) {
        throw eventMutationError(
          "INVALID_INPUT",
          "Cannot delete events for another user",
        );
      }
      const result = await eventService.deleteAllByUser(userToRemove);

      res.status(Status.OK).json(result);
    } catch (e) {
      send(res, e);
    }
  };
}

export default new EventController();
