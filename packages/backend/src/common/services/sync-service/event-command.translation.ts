import { ObjectId } from "mongodb";
import {
  CalendarIdSchema,
  type DateTime,
  DateTimeSchema,
  type EventId,
  EventIdSchema,
} from "@core/types/domain-primitives";
import { type Event, EventSchema } from "@core/types/event.contracts";
import {
  type Attendee,
  type AttendeeInput,
} from "@core/types/event-attendance.contracts";
import {
  type EventColorSlot,
  withColor,
} from "@core/types/event-color.contracts";
import {
  type CreateEventInput,
  type DeleteEventInput,
  type RecurrenceScope,
  type ReplaceEventInput,
  type RsvpEventInput,
} from "@core/types/event-command.contracts";
import {
  type CommandSubmitRequest,
  CommandSubmitRequestSchema,
} from "@core/types/sync/command.contracts";
import {
  ClientEventIdSchema,
  type SyncEventContent,
} from "@core/types/sync/event.contracts";
import { IdempotencyKeySchema } from "@core/types/sync/identity.contracts";
import { eventMutationError } from "@backend/event/event.error";
import { decodeOccurrenceId, looksLikeOccurrenceId } from "./occurrence-id";
import { createHash } from "node:crypto";

// Acknowledgment filler when replace omits calendarId (no move). The web is
// optimistic and discards the response body after EventResponseSchema.parse;
// we still need a contract-valid calendarId to round-trip the parse.
const UNKNOWN_CALENDAR_ID = CalendarIdSchema.parse("000000000000000000000000");

// The browser names guests but never sets anyone's RSVP (AttendeeInputSchema
// has no responseStatus), so every intended attendee enters the command — and
// the optimistic response event — as the provider's "no answer yet" state.
// Sync's merge-by-email keeps a retained guest's real provider responseStatus;
// this placeholder only survives for genuinely new emails.
const toIntendedAttendees = (attendees: readonly AttendeeInput[]): Attendee[] =>
  attendees.map(({ email, displayName }) => ({
    email,
    displayName,
    responseStatus: "needsAction" as const,
  }));

// Browser content that may carry a guest-list edit. Omitted attendees means
// "not editing guests" (today's behavior); present, including [], means
// "replace membership with exactly this set" — see EditableContentSchema.
interface BrowserEditableContent {
  title: string;
  description: string;
  location: string;
  color?: EventColorSlot | null;
  attendees?: readonly AttendeeInput[];
}

// Expand browser details-content into sync's fuller content shape. Browser
// edits never touch organizer/conference — pad with nulls so the strict
// SyncEventContent schema accepts the wire payload. On create those nulls are
// correct (new event). On update, sync's apply path merges
// title/description/location onto the existing record (mergeUpdateContent)
// so a rename cannot wipe provider-sourced attendees/conference. Attendees:
// an intended guest list maps in with the needsAction placeholder (paired
// with attendeesEdit "replace" via toAttendeesEdit below); omitted keeps
// today's [] pad, which sync ignores under attendeesEdit "preserve". Optional
// color is forwarded when the browser sets one; omitted color leaves merge
// to keep whatever Sync already stores.
export const toSyncContent = (
  content: BrowserEditableContent,
): SyncEventContent => ({
  title: content.title,
  description: content.description,
  location: content.location,
  organizer: null,
  attendees:
    content.attendees === undefined
      ? []
      : toIntendedAttendees(content.attendees),
  conference: null,
  ...withColor(content.color),
});

// Whether this write replaces guest membership. Derived from presence, not
// emptiness: [] is a deliberate "remove everyone" and must still replace.
const toAttendeesEdit = (
  content: BrowserEditableContent,
): "replace" | "preserve" =>
  content.attendees === undefined ? "preserve" : "replace";

// Synthesized response events echo the intended guest list (needsAction
// placeholders) so the browser's optimistic cache stays coherent until the
// provider-sourced read arrives. Content without a guest edit passes through
// untouched — the input attendee shape has no responseStatus, so it would not
// parse as the read-side AttendeeSchema.
const toResponseContent = <C extends BrowserEditableContent>(
  content: C,
): C | (Omit<C, "attendees"> & { attendees: Attendee[] }) =>
  content.attendees === undefined
    ? content
    : { ...content, attendees: toIntendedAttendees(content.attendees) };

export interface CommandTarget {
  eventId: EventId;
  scope: RecurrenceScope;
  recurrenceId: DateTime | null;
}

// Address a browser event id for a sync command. A composed occurrence id
// (`eventId::recurrenceId`) reverses into the series + original start; scope
// "all" drops the recurrenceId so the whole series is targeted. A plain id
// (single or series master) has no occurrence to address — coerce to scope
// "all" + null recurrenceId so sync's coherence refine accepts the request
// (the web often sends scope "this" for singles).
//
// An id that LOOKS like a composite occurrence id (contains the `::`
// separator) but fails to decode is a distinct, load-bearing case: it must
// throw rather than fall through to the "plain id" branch below. Falling
// through would silently retarget a "this event only" action at the WHOLE
// series (scope "all") — exactly how an all-day instance composed with a
// stale client-side format, or a doubly-composed thisAndFollowing split id,
// once turned "delete this one instance" into "delete the entire series".
export const resolveCommandTarget = (
  id: string,
  scope: RecurrenceScope,
): CommandTarget => {
  const parts = decodeOccurrenceId(id);
  if (parts) {
    if (scope === "all") {
      return {
        eventId: EventIdSchema.parse(parts.eventId),
        scope: "all",
        recurrenceId: null,
      };
    }
    return {
      eventId: EventIdSchema.parse(parts.eventId),
      scope,
      recurrenceId: DateTimeSchema.parse(parts.recurrenceId),
    };
  }

  if (looksLikeOccurrenceId(id)) {
    throw eventMutationError(
      "INVALID_OCCURRENCE_ID",
      `Event id "${id}" looks like an occurrence reference but could not be decoded`,
    );
  }

  return {
    eventId: EventIdSchema.parse(id),
    scope: "all",
    recurrenceId: null,
  };
};

const hashedIdempotencyKey = (prefix: string, payload: unknown): string => {
  const digest = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 40);
  return IdempotencyKeySchema.parse(`${prefix}:${digest}`);
};

const mintEventId = (): EventId =>
  EventIdSchema.parse(new ObjectId().toHexString());

// Create → one submit request. Prefer the client-supplied id (optimistic
// create / undo-of-delete); mint an ObjectId when absent. Idempotency key is
// stable on eventId so a retried POST maps to the same command.
export const toCreateSubmitRequest = (
  input: CreateEventInput,
): { request: CommandSubmitRequest; responseEvent: Event } => {
  const eventId = input.id ?? mintEventId();
  // When the browser supplies an id (optimistic create / IndexedDB promotion),
  // preserve it as clientEventId so Sync can correlate device origin across
  // resume. Minted server ids are not client-originated — leave null.
  const clientEventId = input.id ? ClientEventIdSchema.parse(input.id) : null;
  const request = CommandSubmitRequestSchema.parse({
    idempotencyKey: IdempotencyKeySchema.parse(`create:${eventId}`),
    eventId,
    expectedVersion: null,
    input: {
      kind: "create",
      calendarId: input.calendarId,
      clientEventId,
      // The user's save-time choice of whether the provider emails attendees;
      // absent means the pre-attendee default of notifying no one.
      invitation: input.invitation ?? "none",
      attendeesEdit: toAttendeesEdit(input.content),
      content: toSyncContent(input.content),
      schedule: input.schedule,
      recurrence: input.recurrence,
    },
    ...(input.restore ? { restore: true as const } : {}),
  });

  const now = new Date().toISOString();
  const responseEvent = EventSchema.parse({
    id: eventId,
    calendarId: input.calendarId,
    content: toResponseContent(input.content),
    schedule: input.schedule,
    recurrence: input.recurrence,
    createdAt: now,
    updatedAt: null,
  });

  return { request, responseEvent };
};

// Replace → one update command, plus a move when calendarId is present.
// Separate idempotency keys so the two stay independently retryable. The
// response Event is synthesized from the request (web is optimistic and only
// needs EventResponseSchema to parse).
export const toReplaceSubmitRequests = (
  id: string,
  input: ReplaceEventInput,
): { requests: CommandSubmitRequest[]; responseEvent: Event } => {
  const target = resolveCommandTarget(id, input.scope);

  const updateRequest = CommandSubmitRequestSchema.parse({
    // Hashes the browser payload AS RECEIVED: a legacy payload (no attendees,
    // no invitation) serializes byte-identically to before those fields
    // existed, so its key — and therefore retry/replay identity across a
    // deploy — is unchanged (pinned by the key-stability test). A guest-list
    // edit rides inside `content`, so it naturally mints a distinct key.
    // `invitation` stays out of the hash like `restore` does: it is
    // per-submission delivery intent, not a different edit.
    idempotencyKey: hashedIdempotencyKey("update", {
      eventId: target.eventId,
      scope: target.scope,
      recurrenceId: target.recurrenceId,
      content: input.content,
      schedule: input.schedule,
      recurrence: input.recurrence,
    }),
    eventId: target.eventId,
    expectedVersion: null,
    input: {
      kind: "update",
      invitation: input.invitation ?? "none",
      attendeesEdit: toAttendeesEdit(input.content),
      content: toSyncContent(input.content),
      schedule: input.schedule,
      recurrence: input.recurrence,
      scope: target.scope,
      recurrenceId: target.recurrenceId,
    },
    // Deliberately excluded from the hashed key above - colliding with the
    // original update's key is the point (that's how a replayed edit reaches
    // the same command for the reopen guard to act on).
    ...(input.restore ? { restore: true as const } : {}),
  });

  const requests: CommandSubmitRequest[] = [updateRequest];

  if (input.calendarId !== undefined) {
    requests.push(
      CommandSubmitRequestSchema.parse({
        idempotencyKey: hashedIdempotencyKey("move", {
          eventId: target.eventId,
          calendarId: input.calendarId,
        }),
        eventId: target.eventId,
        expectedVersion: null,
        input: {
          kind: "move",
          calendarId: input.calendarId,
        },
      }),
    );
  }

  const responseEvent = synthesizeReplaceEvent(id, input, target);
  return { requests, responseEvent };
};

// Deliberately identity-only (eventId/scope/recurrenceId, no nonce): a
// timed-out delete must retry under the SAME key so it maps back to the
// original command rather than double-submitting (see submitCommandOrThrow's
// timeout handling in submit-command-or-throw.ts). This does mean two calls
// with the same target collide on one command record — including a delete,
// an undo that recreates the event under the same id, and a second delete.
// Sync's submitCloudCommand (terminalReplayIsStale) is what tells a genuine
// replay apart from a stale one; don't "fix" a collision here with a nonce.
// The undo-of-delete's own recreate is a create/update command carrying the
// `restore` flag (see toCreateSubmitRequest/toReplaceSubmitRequests) - that
// flag is what lets ITS collision (against the original create/update, not
// this delete) get the same reopen treatment.
export const toDeleteSubmitRequest = (
  id: string,
  input: DeleteEventInput,
): CommandSubmitRequest => {
  const target = resolveCommandTarget(id, input.scope);
  return CommandSubmitRequestSchema.parse({
    idempotencyKey: hashedIdempotencyKey("delete", {
      eventId: target.eventId,
      scope: target.scope,
      recurrenceId: target.recurrenceId,
    }),
    eventId: target.eventId,
    expectedVersion: null,
    input: {
      kind: "delete",
      // Guest cancellation emails: the provider notifies attendees of the
      // deletion when the user chose to. Deliberately outside the identity-
      // only idempotency key above — it is delivery intent, not a different
      // delete.
      invitation: input.invitation ?? "none",
      scope: target.scope,
      recurrenceId: target.recurrenceId,
    },
  });
};

// RSVP → one rsvp command. The browser's scope vocabulary is "single" | "all"
// (RsvpEventInputSchema): "single" answers exactly the addressed event — one
// occurrence when the URL id is a composite occurrence id, or the event itself
// for a plain id (resolveCommandTarget coerces that to sync's scope "all" +
// null recurrenceId, exactly as update/delete address a non-recurring event) —
// and "all" answers the whole series (composite ids drop their recurrenceId).
// "thisAndFollowing" is deliberately unreachable: sync refuses it typed for
// rsvp, so no translation may ever mint it.
//
// The idempotency key is derived from event + status + scope (target identity
// plus the answer): repeating the same answer replays the same command, while
// changing the answer — or the scope — mints a distinct command. Like
// delete's key, it is deliberately nonce-free so a timed-out POST retried by
// the client maps back to the original command instead of double-submitting.
export const toRsvpSubmitRequest = (
  id: string,
  input: RsvpEventInput,
): CommandSubmitRequest => {
  const target = resolveCommandTarget(
    id,
    input.scope === "all" ? "all" : "this",
  );
  return CommandSubmitRequestSchema.parse({
    idempotencyKey: hashedIdempotencyKey("rsvp", {
      eventId: target.eventId,
      scope: target.scope,
      recurrenceId: target.recurrenceId,
      responseStatus: input.responseStatus,
    }),
    eventId: target.eventId,
    expectedVersion: null,
    input: {
      kind: "rsvp",
      responseStatus: input.responseStatus,
      scope: target.scope,
      recurrenceId: target.recurrenceId,
    },
  });
};

// Best-effort Event for the browser response. Cache updates are optimistic;
// this only needs to satisfy EventResponseSchema.parse on the web.
const synthesizeReplaceEvent = (
  requestId: string,
  input: ReplaceEventInput,
  target: CommandTarget,
): Event => {
  const recurrence = (() => {
    if (input.recurrence.kind === "series") {
      return { kind: "series" as const, rules: input.recurrence.rules };
    }
    if (input.recurrence.kind === "single") {
      return { kind: "single" as const };
    }
    // preserve: keep occurrence linkage when the request addressed one;
    // otherwise a plain single is the safe acknowledgment shape.
    if (target.recurrenceId !== null) {
      return { kind: "occurrence" as const, seriesId: target.eventId };
    }
    return { kind: "single" as const };
  })();

  const parts = decodeOccurrenceId(requestId);
  const responseId =
    parts && target.recurrenceId !== null ? requestId : target.eventId;

  return EventSchema.parse({
    id: responseId,
    calendarId: input.calendarId ?? UNKNOWN_CALENDAR_ID,
    content: toResponseContent(input.content),
    schedule: input.schedule,
    recurrence,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
};
