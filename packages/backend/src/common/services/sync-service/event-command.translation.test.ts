import { faker } from "@faker-js/faker";
import {
  type CalendarId,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { EventSchema } from "@core/types/event.contracts";
import { CommandSubmitRequestSchema } from "@core/types/sync/command.contracts";
import { type IdempotencyKey } from "@core/types/sync/identity.contracts";
import {
  resolveCommandTarget,
  toCreateSubmitRequest,
  toDeleteSubmitRequest,
  toReplaceSubmitRequests,
  toRsvpSubmitRequest,
  toSyncContent,
} from "./event-command.translation";
import { composeOccurrenceId } from "./occurrence-id";
import { describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

const timedSchedule = {
  kind: "timed" as const,
  start: "2026-07-14T09:00:00.000Z" as DateTime,
  end: "2026-07-14T10:00:00.000Z" as DateTime,
  timeZone: "UTC" as TimeZone,
};

describe("toSyncContent", () => {
  it("pads browser details into the full sync content shape", () => {
    expect(
      toSyncContent({ title: "Standup", description: "Daily", location: "" }),
    ).toEqual({
      title: "Standup",
      description: "Daily",
      location: "",
      organizer: null,
      attendees: [],
      conference: null,
    });
  });

  it("forwards the browser's location onto sync content", () => {
    expect(
      toSyncContent({
        title: "Standup",
        description: "Daily",
        location: "Room A",
      }),
    ).toEqual({
      title: "Standup",
      description: "Daily",
      location: "Room A",
      organizer: null,
      attendees: [],
      conference: null,
    });
  });

  it("forwards an optional color onto sync content", () => {
    expect(
      toSyncContent({
        title: "Standup",
        description: "Daily",
        location: "",
        color: "coral",
      }),
    ).toEqual({
      title: "Standup",
      description: "Daily",
      location: "",
      organizer: null,
      attendees: [],
      conference: null,
      color: "coral",
    });
  });

  it("omits color when the browser did not set one", () => {
    expect(
      toSyncContent({ title: "Standup", description: "Daily", location: "" }),
    ).not.toHaveProperty("color");
  });

  it("maps intended attendees in with the needsAction placeholder", () => {
    expect(
      toSyncContent({
        title: "Standup",
        description: "Daily",
        location: "",
        attendees: [
          { email: "ada@example.com", displayName: "Ada" },
          { email: "grace@example.com", displayName: null },
        ],
      }),
    ).toEqual({
      title: "Standup",
      description: "Daily",
      location: "",
      organizer: null,
      attendees: [
        {
          email: "ada@example.com",
          displayName: "Ada",
          responseStatus: "needsAction",
        },
        {
          email: "grace@example.com",
          displayName: null,
          responseStatus: "needsAction",
        },
      ],
      conference: null,
    });
  });

  it("keeps an explicit empty guest list as [] (remove everyone)", () => {
    expect(
      toSyncContent({
        title: "Standup",
        description: "Daily",
        location: "",
        attendees: [],
      }).attendees,
    ).toEqual([]);
  });
});

describe("resolveCommandTarget", () => {
  it("decodes a composed occurrence id into eventId + recurrenceId", () => {
    const eventId = objectId() as EventId;
    const recurrenceId = "2026-07-14T09:00:00.000Z" as DateTime;
    const id = composeOccurrenceId({ eventId, recurrenceId });

    expect(resolveCommandTarget(id, "this")).toEqual({
      eventId: eventId as EventId,
      scope: "this",
      recurrenceId: recurrenceId,
    });
  });

  it("drops recurrenceId when scope is all on a composed id", () => {
    const eventId = objectId() as EventId;
    const id = composeOccurrenceId({
      eventId,
      recurrenceId: "2026-07-14T09:00:00.000Z",
    });

    expect(resolveCommandTarget(id, "all")).toEqual({
      eventId: eventId as EventId,
      scope: "all",
      recurrenceId: null,
    });
  });

  it("coerces a plain id with scope this to all + null recurrenceId", () => {
    // Web sends scope "this" for singles; sync requires scope all ⇔ no recurrenceId.
    const eventId = objectId() as EventId;
    expect(resolveCommandTarget(eventId, "this")).toEqual({
      eventId: eventId as EventId,
      scope: "all",
      recurrenceId: null,
    });
  });

  it("throws on a composite id whose recurrenceId is malformed, rather than widening to scope all", () => {
    // Must never silently fall through to "plain id" and delete/edit the
    // WHOLE series when the caller only meant one instance.
    const id = `${objectId()}::not-a-real-datetime`;
    expect(() => resolveCommandTarget(id, "this")).toThrow(
      /INVALID_OCCURRENCE_ID|could not be decoded/,
    );
  });

  it("throws on a doubly-composed id (a thisAndFollowing split's own occurrence)", () => {
    const id = `${objectId()}::2026-07-14T09:00:00.000Z::2026-07-21T09:00:00.000Z`;
    expect(() => resolveCommandTarget(id, "this")).toThrow();
  });

  it("throws on a composite id whose eventId segment is not an ObjectId", () => {
    const id = "not-an-object-id::2026-07-14T09:00:00.000Z";
    expect(() => resolveCommandTarget(id, "this")).toThrow();
  });
});

describe("toCreateSubmitRequest", () => {
  it("builds a create command and a parseable response Event", () => {
    const calendarId = objectId() as CalendarId;
    const eventId = objectId() as EventId;
    const { request, responseEvent } = toCreateSubmitRequest({
      id: eventId,
      calendarId: calendarId as CalendarId,
      content: {
        kind: "details",
        title: "Lunch",
        description: "",
        location: "",
      },
      schedule: timedSchedule,
      recurrence: { kind: "single" },
    });

    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
    expect(request.eventId).toBe(eventId);
    expect(request.idempotencyKey).toBe(`create:${eventId}` as IdempotencyKey);
    expect(request.expectedVersion).toBeNull();
    expect(request.input).toMatchObject({
      kind: "create",
      calendarId,
      clientEventId: eventId,
      invitation: "none",
      recurrence: { kind: "single" },
    });
    expect(() => EventSchema.parse(responseEvent)).not.toThrow();
    expect(responseEvent.id).toBe(eventId);
  });

  it("mints an eventId when the client omits one", () => {
    const { request } = toCreateSubmitRequest({
      calendarId: objectId() as CalendarId,
      content: { kind: "details", title: "X", description: "", location: "" },
      schedule: timedSchedule,
      recurrence: { kind: "single" },
    });

    expect(request.eventId).toMatch(/^[0-9a-f]{24}$/);
    expect(request.idempotencyKey).toBe(
      `create:${request.eventId}` as IdempotencyKey,
    );
    expect(request.input).toMatchObject({
      kind: "create",
      clientEventId: null,
    });
  });

  it("forwards restore:true from an undo-of-delete input", () => {
    const { request } = toCreateSubmitRequest({
      id: objectId() as EventId,
      calendarId: objectId() as CalendarId,
      content: { kind: "details", title: "X", description: "", location: "" },
      schedule: timedSchedule,
      recurrence: { kind: "single" },
      restore: true,
    });

    expect(request.restore).toBe(true);
    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
  });

  it("omits restore when the input does not set it", () => {
    const { request } = toCreateSubmitRequest({
      calendarId: objectId() as CalendarId,
      content: { kind: "details", title: "X", description: "", location: "" },
      schedule: timedSchedule,
      recurrence: { kind: "single" },
    });

    expect(request.restore).toBeUndefined();
  });

  it("threads attendees and invitation into a schema-valid create command", () => {
    const { request, responseEvent } = toCreateSubmitRequest({
      id: objectId() as EventId,
      calendarId: objectId() as CalendarId,
      content: {
        kind: "details",
        title: "Kickoff",
        description: "",
        location: "",
        attendees: [{ email: "ada@example.com", displayName: "Ada" }],
      },
      schedule: timedSchedule,
      recurrence: { kind: "single" },
      invitation: "all",
    });

    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
    expect(request.input).toMatchObject({
      kind: "create",
      invitation: "all",
      attendeesEdit: "replace",
    });
    if (request.input.kind !== "create") return;
    expect(request.input.content.attendees).toEqual([
      {
        email: "ada@example.com",
        displayName: "Ada",
        responseStatus: "needsAction",
      },
    ]);
    // The optimistic response event carries the intended guests so the
    // browser cache stays coherent until the provider-sourced read arrives.
    expect(() => EventSchema.parse(responseEvent)).not.toThrow();
    expect(
      responseEvent.content.kind === "details" &&
        responseEvent.content.attendees,
    ).toEqual([
      {
        email: "ada@example.com",
        displayName: "Ada",
        responseStatus: "needsAction",
      },
    ]);
  });

  it("keeps a legacy create input on preserve with no notification", () => {
    const { request, responseEvent } = toCreateSubmitRequest({
      id: objectId() as EventId,
      calendarId: objectId() as CalendarId,
      content: { kind: "details", title: "X", description: "", location: "" },
      schedule: timedSchedule,
      recurrence: { kind: "single" },
    });

    expect(request.input).toMatchObject({
      kind: "create",
      invitation: "none",
      attendeesEdit: "preserve",
    });
    if (request.input.kind !== "create") return;
    expect(request.input.content.attendees).toEqual([]);
    expect(responseEvent.content).not.toHaveProperty("attendees");
  });
});

describe("toReplaceSubmitRequests", () => {
  it("emits a single update for a plain-id replace without a calendar move", () => {
    const eventId = objectId() as EventId;
    const { requests, responseEvent } = toReplaceSubmitRequests(eventId, {
      content: {
        kind: "details",
        title: "Renamed",
        description: "",
        location: "",
      },
      schedule: timedSchedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input.kind).toBe("update");
    if (requests[0]?.input.kind !== "update") return;
    // Plain id + scope this → coerced to all.
    expect(requests[0].input.scope).toBe("all");
    expect(requests[0].input.recurrenceId).toBeNull();
    expect(() => EventSchema.parse(responseEvent)).not.toThrow();
  });

  it("addresses an occurrence update with the decoded recurrenceId", () => {
    const eventId = objectId() as EventId;
    const recurrenceId = "2026-07-14T09:00:00.000Z" as DateTime;
    const id = composeOccurrenceId({ eventId, recurrenceId });
    const { requests } = toReplaceSubmitRequests(id, {
      content: {
        kind: "details",
        title: "Moved",
        description: "",
        location: "",
      },
      schedule: timedSchedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    expect(requests).toHaveLength(1);
    const update = requests[0];
    expect(update?.eventId).toBe(eventId);
    if (update?.input.kind !== "update") return;
    expect(update.input.scope).toBe("this");
    expect(update.input.recurrenceId).toBe(recurrenceId);
  });

  it("forwards restore:true without changing the update idempotency key", () => {
    const eventId = objectId() as EventId;
    const input = {
      content: {
        kind: "details" as const,
        title: "Renamed",
        description: "",
        location: "",
      },
      schedule: timedSchedule,
      recurrence: { kind: "preserve" as const },
      scope: "this" as const,
    };
    const { requests: plain } = toReplaceSubmitRequests(eventId, input);
    const { requests: restored } = toReplaceSubmitRequests(eventId, {
      ...input,
      restore: true,
    });

    expect(plain[0]?.restore).toBeUndefined();
    expect(restored[0]?.restore).toBe(true);
    // The whole point: a replayed edit collides with the original update's
    // command record, so the reopen guard in command-replay.ts can act on it.
    expect(restored[0]?.idempotencyKey).toBe(plain[0]?.idempotencyKey);
  });

  it("threads attendees and invitation into a schema-valid update command", () => {
    const eventId = objectId() as EventId;
    const { requests, responseEvent } = toReplaceSubmitRequests(eventId, {
      content: {
        kind: "details",
        title: "Kickoff",
        description: "",
        location: "",
        attendees: [
          { email: "ada@example.com", displayName: "Ada" },
          { email: "grace@example.com", displayName: null },
        ],
      },
      schedule: timedSchedule,
      recurrence: { kind: "preserve" },
      scope: "this",
      invitation: "all",
    });

    expect(requests).toHaveLength(1);
    const request = requests[0];
    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
    expect(request?.input).toMatchObject({
      kind: "update",
      invitation: "all",
      attendeesEdit: "replace",
    });
    if (request?.input.kind !== "update") return;
    expect(request.input.content.attendees).toEqual([
      {
        email: "ada@example.com",
        displayName: "Ada",
        responseStatus: "needsAction",
      },
      {
        email: "grace@example.com",
        displayName: null,
        responseStatus: "needsAction",
      },
    ]);
    expect(() => EventSchema.parse(responseEvent)).not.toThrow();
    expect(
      responseEvent.content.kind === "details" &&
        responseEvent.content.attendees,
    ).toEqual([
      {
        email: "ada@example.com",
        displayName: "Ada",
        responseStatus: "needsAction",
      },
      {
        email: "grace@example.com",
        displayName: null,
        responseStatus: "needsAction",
      },
    ]);
  });

  it("marks an explicit empty guest list as replace, not preserve", () => {
    const { requests } = toReplaceSubmitRequests(objectId(), {
      content: {
        kind: "details",
        title: "Solo",
        description: "",
        location: "",
        attendees: [],
      },
      schedule: timedSchedule,
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    expect(requests[0]?.input).toMatchObject({
      kind: "update",
      attendeesEdit: "replace",
    });
    if (requests[0]?.input.kind !== "update") return;
    expect(requests[0].input.content.attendees).toEqual([]);
  });

  // Snapshot regression for the pack's backward-compat guarantee: a payload
  // that predates attendee support must build the same submit request it
  // always did (invitation none, attendeesEdit preserve, [] attendee pad).
  it("builds a byte-identical submit request for a legacy replace payload", () => {
    const eventId = "64b7f7f7f7f7f7f7f7f7f7f7" as EventId;
    const { requests } = toReplaceSubmitRequests(eventId, {
      content: {
        kind: "details",
        title: "Standup",
        description: "Daily",
        location: "Room A",
      },
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00.000Z" as DateTime,
        end: "2026-07-14T10:00:00.000Z" as DateTime,
        timeZone: "UTC" as TimeZone,
      },
      recurrence: { kind: "preserve" },
      scope: "this",
    });

    expect(requests).toEqual([
      {
        idempotencyKey: "update:0b7c2048556d01da12ae81970f090b767bc6a6bc",
        eventId,
        expectedVersion: null,
        input: {
          kind: "update",
          invitation: "none",
          attendeesEdit: "preserve",
          content: {
            title: "Standup",
            description: "Daily",
            location: "Room A",
            organizer: null,
            attendees: [],
            conference: null,
          },
          schedule: {
            kind: "timed",
            start: "2026-07-14T09:00:00.000Z",
            end: "2026-07-14T10:00:00.000Z",
            timeZone: "UTC",
          },
          recurrence: { kind: "preserve" },
          scope: "all",
          recurrenceId: null,
        },
      },
    ] as never);
  });

  // The mandatory key-stability lock: the literal below was computed from the
  // PRE-attendee translator for this exact payload. If it ever changes, a
  // deployed retry of an in-flight legacy edit would mint a NEW command
  // instead of replaying the original — double-applying the write. The hash
  // covers the browser content AS RECEIVED, so absent attendees/invitation
  // serialize exactly as they did before those fields existed.
  it("keeps the legacy update idempotency key stable across the attendee rollout", () => {
    const legacyInput = {
      content: {
        kind: "details" as const,
        title: "Standup",
        description: "Daily",
        location: "Room A",
      },
      schedule: {
        kind: "timed" as const,
        start: "2026-07-14T09:00:00.000Z" as DateTime,
        end: "2026-07-14T10:00:00.000Z" as DateTime,
        timeZone: "UTC" as TimeZone,
      },
      recurrence: { kind: "preserve" as const },
      scope: "this" as const,
    };
    const { requests } = toReplaceSubmitRequests(
      "64b7f7f7f7f7f7f7f7f7f7f7",
      legacyInput,
    );

    expect(requests[0]?.idempotencyKey).toBe(
      "update:0b7c2048556d01da12ae81970f090b767bc6a6bc" as IdempotencyKey,
    );
    // invitation is per-submission delivery intent, deliberately outside the
    // hash (like restore): the same edit resubmitted with a different email
    // choice must reach the same command record.
    const { requests: withInvitation } = toReplaceSubmitRequests(
      "64b7f7f7f7f7f7f7f7f7f7f7",
      { ...legacyInput, invitation: "all" },
    );
    expect(withInvitation[0]?.idempotencyKey).toBe(
      "update:0b7c2048556d01da12ae81970f090b767bc6a6bc" as IdempotencyKey,
    );
    // A guest-list edit rides inside content, so it mints a distinct key.
    const { requests: withGuests } = toReplaceSubmitRequests(
      "64b7f7f7f7f7f7f7f7f7f7f7",
      {
        ...legacyInput,
        content: {
          ...legacyInput.content,
          attendees: [{ email: "ada@example.com", displayName: null }],
        },
      },
    );
    expect(withGuests[0]?.idempotencyKey).not.toBe(
      "update:0b7c2048556d01da12ae81970f090b767bc6a6bc",
    );
  });

  it("appends a move command when calendarId is present", () => {
    const eventId = objectId() as EventId;
    const calendarId = objectId() as CalendarId;
    const { requests } = toReplaceSubmitRequests(eventId, {
      calendarId: calendarId as CalendarId,
      content: { kind: "details", title: "X", description: "", location: "" },
      schedule: timedSchedule,
      recurrence: { kind: "single" },
      scope: "this",
    });

    expect(requests.map((r) => r.input.kind)).toEqual(["update", "move"]);
    expect(requests[1]?.input).toEqual({ kind: "move", calendarId });
    // Distinct idempotency keys so the two stay independently retryable.
    expect(requests[0]?.idempotencyKey).not.toBe(requests[1]?.idempotencyKey);
  });
});

describe("toDeleteSubmitRequest", () => {
  it("builds a delete command from a composed occurrence id", () => {
    const eventId = objectId() as EventId;
    const recurrenceId = "2026-07-14T09:00:00.000Z" as DateTime;
    const id = composeOccurrenceId({ eventId, recurrenceId });
    const request = toDeleteSubmitRequest(id, { scope: "this" });

    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
    expect(request.eventId).toBe(eventId);
    if (request.input.kind !== "delete") return;
    expect(request.input.scope).toBe("this");
    expect(request.input.recurrenceId).toBe(recurrenceId);
  });

  // Pins the retry contract: submitCommandOrThrow retries a timed-out delete
  // under the SAME key so it maps back to the original command instead of
  // double-submitting. This is deliberate, not an oversight — two identical
  // deletes (including a delete, an undo that recreates the event under the
  // same id, and a second delete) collide on one command record on purpose.
  // Telling a genuine retry apart from a stale replay is Sync's job
  // (submitCloudCommand's terminalReplayIsStale), not the key's. Don't add a
  // nonce here.
  it("produces the same idempotency key for two identical deletes", () => {
    const eventId = objectId() as EventId;
    const first = toDeleteSubmitRequest(eventId, { scope: "all" });
    const second = toDeleteSubmitRequest(eventId, { scope: "all" });

    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  // Guest cancellation emails: the user's save-time choice flows onto the
  // delete command instead of the old hardcoded "none".
  it("threads invitation through a delete without changing its identity key", () => {
    const eventId = "64b7f7f7f7f7f7f7f7f7f7f7" as EventId;
    const request = toDeleteSubmitRequest(eventId, {
      scope: "all",
      invitation: "all",
    });

    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
    if (request.input.kind !== "delete") return;
    expect(request.input.invitation).toBe("all");
    // Identity-only key, pinned from the pre-attendee translator: a legacy
    // delete AND one carrying an invitation both map to the same command, so
    // a timed-out delete retried with either shape never double-submits.
    expect(request.idempotencyKey).toBe(
      "delete:b65cb27825e51d116acdcb198b1f11786dd971c4" as IdempotencyKey,
    );
    const legacy = toDeleteSubmitRequest(eventId, { scope: "all" });
    expect(legacy.idempotencyKey).toBe(
      "delete:b65cb27825e51d116acdcb198b1f11786dd971c4" as IdempotencyKey,
    );
    if (legacy.input.kind !== "delete") return;
    expect(legacy.input.invitation).toBe("none");
  });
});

describe("toRsvpSubmitRequest", () => {
  // Occurrence-scope payload proof (WP-08): browser scope "single" on a
  // composite occurrence id addresses exactly that occurrence — sync scope
  // "this" with the decoded recurrenceId, never the whole series.
  it("addresses one occurrence for scope single on a composite id", () => {
    const eventId = objectId() as EventId;
    const recurrenceId = "2026-07-21T15:00:00.000Z";
    const id = composeOccurrenceId({ eventId, recurrenceId });
    const request = toRsvpSubmitRequest(id, {
      responseStatus: "declined",
      scope: "single",
    });

    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
    expect(request.eventId).toBe(eventId);
    expect(request.expectedVersion).toBeNull();
    expect<unknown>(request.input).toEqual({
      kind: "rsvp",
      responseStatus: "declined",
      scope: "this",
      recurrenceId,
    });
  });

  it("targets the series master for scope all on a composite id", () => {
    const eventId = objectId() as EventId;
    const id = composeOccurrenceId({
      eventId,
      recurrenceId: "2026-07-21T15:00:00.000Z",
    });
    const request = toRsvpSubmitRequest(id, {
      responseStatus: "accepted",
      scope: "all",
    });

    expect(() => CommandSubmitRequestSchema.parse(request)).not.toThrow();
    expect(request.eventId).toBe(eventId);
    expect(request.input).toEqual({
      kind: "rsvp",
      responseStatus: "accepted",
      scope: "all",
      recurrenceId: null,
    });
  });

  // A non-recurring event has no occurrence to address: scope "single" on a
  // plain id answers the event itself, coerced to sync's coherent
  // scope-"all" + null recurrenceId exactly like update/delete. Never
  // "thisAndFollowing" — sync refuses that typed for rsvp.
  it("coerces scope single on a plain id to the event itself (scope all, null recurrenceId)", () => {
    const eventId = objectId() as EventId;
    const request = toRsvpSubmitRequest(eventId, {
      responseStatus: "tentative",
      scope: "single",
    });

    expect(request.eventId).toBe(eventId);
    expect(request.input).toEqual({
      kind: "rsvp",
      responseStatus: "tentative",
      scope: "all",
      recurrenceId: null,
    });
  });

  // Idempotency key = event + status + scope: the same answer replays the
  // same command; a different answer, target, or scope mints a new one.
  it("derives the idempotency key from event + status + scope", () => {
    const eventId = objectId() as EventId;
    const id = composeOccurrenceId({
      eventId,
      recurrenceId: "2026-07-21T15:00:00.000Z",
    });
    const accept = { responseStatus: "accepted", scope: "single" } as const;

    const first = toRsvpSubmitRequest(id, accept);
    const replay = toRsvpSubmitRequest(id, accept);
    expect(replay.idempotencyKey).toBe(first.idempotencyKey);
    expect(first.idempotencyKey).toStartWith("rsvp:");

    const changedAnswer = toRsvpSubmitRequest(id, {
      responseStatus: "declined",
      scope: "single",
    });
    expect(changedAnswer.idempotencyKey).not.toBe(first.idempotencyKey);

    const changedScope = toRsvpSubmitRequest(id, {
      responseStatus: "accepted",
      scope: "all",
    });
    expect(changedScope.idempotencyKey).not.toBe(first.idempotencyKey);

    const otherEvent = toRsvpSubmitRequest(
      composeOccurrenceId({
        eventId: objectId() as EventId,
        recurrenceId: "2026-07-21T15:00:00.000Z",
      }),
      accept,
    );
    expect(otherEvent.idempotencyKey).not.toBe(first.idempotencyKey);
  });

  it("throws INVALID_OCCURRENCE_ID on a malformed composite id rather than widening to the series", () => {
    expect(() =>
      toRsvpSubmitRequest(`${objectId()}::not-a-date`, {
        responseStatus: "accepted",
        scope: "single",
      }),
    ).toThrow(/looks like an occurrence reference/);
  });
});
