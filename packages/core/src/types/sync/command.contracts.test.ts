import { faker } from "@faker-js/faker";
import {
  SyncCommandFailureReasonSchema,
  SyncCommandInputSchema,
  SyncCommandOutcomeSchema,
  SyncCommandSchema,
} from "@core/types/sync/command.contracts";
import { type ClientEventId } from "@core/types/sync/event.contracts";

const objectId = () => faker.database.mongodbObjectId();

const timedSchedule = {
  kind: "timed",
  start: "2026-07-14T09:00:00-06:00",
  end: "2026-07-14T10:00:00-06:00",
  timeZone: "America/Denver",
};

const baseContent = {
  title: "Standup",
  description: "Daily sync",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
};

const createInput = () => ({
  kind: "create",
  calendarId: objectId(),
  content: baseContent,
  schedule: timedSchedule,
  recurrence: { kind: "single" },
});

// A this/thisAndFollowing scope must carry a recurrenceId; scope "all" must not.
const recurrenceIdFor = (scope: string) =>
  scope === "all" ? null : "2026-07-14T09:00:00-06:00";

const updateInput = (scope: string = "this") => ({
  kind: "update",
  content: baseContent,
  schedule: timedSchedule,
  recurrence: { kind: "preserve" },
  scope,
  recurrenceId: recurrenceIdFor(scope),
});

const moveInput = () => ({ kind: "move", calendarId: objectId() });

const rsvpInput = (scope: string = "this") => ({
  kind: "rsvp",
  responseStatus: "accepted",
  scope,
  recurrenceId: recurrenceIdFor(scope),
});

const deleteInput = (scope: string = "this") => ({
  kind: "delete",
  scope,
  recurrenceId: recurrenceIdFor(scope),
});

const pendingOutcome = { state: "pending" };

const confirmedLocalOutcome = {
  state: "confirmed",
  providerEventId: null,
  providerVersion: null,
};

const confirmedLinkedOutcome = {
  state: "confirmed",
  providerEventId: "abc123@google.com",
  providerVersion: "etag-1",
};

const baseCommand = (overrides: Record<string, unknown> = {}) => ({
  id: objectId(),
  tenantId: objectId(),
  principalId: objectId(),
  idempotencyKey: "client-generated-key-1",
  eventId: objectId(),
  input: createInput(),
  expectedVersion: null,
  outcome: pendingOutcome,
  attemptCount: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

describe("Sync command contracts", () => {
  describe("SyncCommandInputSchema", () => {
    it("accepts a create input", () => {
      expect(SyncCommandInputSchema.safeParse(createInput()).success).toBe(
        true,
      );
    });

    it("defaults a create's clientEventId to null when absent", () => {
      const parsed = SyncCommandInputSchema.safeParse(createInput());
      expect(parsed.success && parsed.data.kind === "create").toBe(true);
      if (parsed.success && parsed.data.kind === "create") {
        expect(parsed.data.clientEventId).toBeNull();
      }
    });

    it("defaults createConference to false and omits guestsCanInviteOthers", () => {
      const parsed = SyncCommandInputSchema.parse(createInput());
      if (parsed.kind === "create") {
        expect(parsed.createConference).toBe(false);
        expect(parsed.guestsCanInviteOthers).toBeUndefined();
      }
    });

    it("accepts booking-only create flags", () => {
      const parsed = SyncCommandInputSchema.parse({
        ...createInput(),
        createConference: true,
        guestsCanInviteOthers: true,
      });
      if (parsed.kind === "create") {
        expect(parsed.createConference).toBe(true);
        expect(parsed.guestsCanInviteOthers).toBe(true);
      }
    });

    it("accepts a create carrying a clientEventId for promotion", () => {
      const promoted = { ...createInput(), clientEventId: objectId() };
      const parsed = SyncCommandInputSchema.safeParse(promoted);
      expect(parsed.success).toBe(true);
      if (parsed.success && parsed.data.kind === "create") {
        expect(parsed.data.clientEventId).toBe(
          promoted.clientEventId as ClientEventId,
        );
      }
    });

    it.each([
      "this",
      "thisAndFollowing",
      "all",
    ] as const)("accepts an update input with scope %s", (scope) => {
      expect(SyncCommandInputSchema.safeParse(updateInput(scope)).success).toBe(
        true,
      );
    });

    it("defaults an update's invitation to none when absent", () => {
      const parsed = SyncCommandInputSchema.safeParse(updateInput());
      expect(parsed.success && parsed.data.kind === "update").toBe(true);
      if (parsed.success && parsed.data.kind === "update") {
        expect(parsed.data.invitation).toBe("none");
      }
    });

    it("accepts an update carrying an explicit invitation", () => {
      const parsed = SyncCommandInputSchema.safeParse({
        ...updateInput(),
        invitation: "all",
      });
      expect(parsed.success && parsed.data.kind === "update").toBe(true);
      if (parsed.success && parsed.data.kind === "update") {
        expect(parsed.data.invitation).toBe("all");
      }
    });

    it("defaults recurrenceId to null when absent", () => {
      const { recurrenceId: _omit, ...withoutTarget } = updateInput("all");
      const parsed = SyncCommandInputSchema.safeParse(withoutTarget);
      expect(parsed.success && parsed.data.kind === "update").toBe(true);
      if (parsed.success && parsed.data.kind === "update") {
        expect(parsed.data.recurrenceId).toBeNull();
      }
    });

    it("accepts a move input", () => {
      expect(SyncCommandInputSchema.safeParse(moveInput()).success).toBe(true);
    });

    it("rejects a move input carrying content", () => {
      const input = { ...moveInput(), content: baseContent };
      expect(SyncCommandInputSchema.safeParse(input).success).toBe(false);
    });

    it.each([
      "this",
      "thisAndFollowing",
      "all",
    ] as const)("accepts a delete input with scope %s", (scope) => {
      expect(SyncCommandInputSchema.safeParse(deleteInput(scope)).success).toBe(
        true,
      );
    });

    it("defaults a delete's invitation to none when absent", () => {
      const parsed = SyncCommandInputSchema.safeParse(deleteInput());
      expect(parsed.success && parsed.data.kind === "delete").toBe(true);
      if (parsed.success && parsed.data.kind === "delete") {
        expect(parsed.data.invitation).toBe("none");
      }
    });

    it("rejects an update input carrying a calendarId", () => {
      const input = { ...updateInput(), calendarId: objectId() };
      expect(SyncCommandInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects an unrecognized kind", () => {
      expect(
        SyncCommandInputSchema.safeParse({ kind: "archive" }).success,
      ).toBe(false);
    });

    it.each([
      "create",
      "update",
    ] as const)("defaults a legacy %s input without attendeesEdit to preserve", (kind) => {
      const legacy = kind === "create" ? createInput() : updateInput();
      const parsed = SyncCommandInputSchema.safeParse(legacy);
      expect(parsed.success && parsed.data.kind === kind).toBe(true);
      if (
        parsed.success &&
        (parsed.data.kind === "create" || parsed.data.kind === "update")
      ) {
        expect(parsed.data.attendeesEdit).toBe("preserve");
      }
    });

    it("round-trips an explicit attendeesEdit replace on an update", () => {
      const parsed = SyncCommandInputSchema.safeParse({
        ...updateInput(),
        attendeesEdit: "replace",
      });
      expect(parsed.success && parsed.data.kind === "update").toBe(true);
      if (parsed.success && parsed.data.kind === "update") {
        expect(parsed.data.attendeesEdit).toBe("replace");
      }
    });

    it("rejects an unrecognized attendeesEdit value", () => {
      const input = { ...createInput(), attendeesEdit: "merge" };
      expect(SyncCommandInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects attendeesEdit on move and delete inputs", () => {
      for (const input of [moveInput(), deleteInput()]) {
        expect(
          SyncCommandInputSchema.safeParse({
            ...input,
            attendeesEdit: "replace",
          }).success,
        ).toBe(false);
      }
    });

    it.each([
      "this",
      "thisAndFollowing",
      "all",
    ] as const)("accepts an rsvp input with scope %s", (scope) => {
      expect(SyncCommandInputSchema.safeParse(rsvpInput(scope)).success).toBe(
        true,
      );
    });

    it.each([
      "accepted",
      "declined",
      "tentative",
    ] as const)("accepts an rsvp answering %s", (responseStatus) => {
      const input = { ...rsvpInput(), responseStatus };
      expect(SyncCommandInputSchema.safeParse(input).success).toBe(true);
    });

    it("rejects an rsvp answering needsAction", () => {
      const input = { ...rsvpInput(), responseStatus: "needsAction" };
      expect(SyncCommandInputSchema.safeParse(input).success).toBe(false);
    });

    it("defaults an rsvp's recurrenceId to null when absent", () => {
      const { recurrenceId: _omit, ...withoutTarget } = rsvpInput("all");
      const parsed = SyncCommandInputSchema.safeParse(withoutTarget);
      expect(parsed.success && parsed.data.kind === "rsvp").toBe(true);
      if (parsed.success && parsed.data.kind === "rsvp") {
        expect(parsed.data.recurrenceId).toBeNull();
      }
    });

    it("rejects an rsvp input carrying content — rsvp is not an update", () => {
      const input = { ...rsvpInput(), content: baseContent };
      expect(SyncCommandInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects an rsvp input carrying an invitation — rsvp never emails", () => {
      const input = { ...rsvpInput(), invitation: "all" };
      expect(SyncCommandInputSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("SyncCommandOutcomeSchema", () => {
    it.each([
      "pending",
      "applying",
      "reconciling",
      "cancelled",
    ] as const)("accepts the bare %s state", (state) => {
      expect(SyncCommandOutcomeSchema.safeParse({ state }).success).toBe(true);
    });

    it("accepts a locally confirmed outcome with no provider target", () => {
      expect(
        SyncCommandOutcomeSchema.safeParse(confirmedLocalOutcome).success,
      ).toBe(true);
    });

    it("accepts a provider-confirmed outcome with full identity", () => {
      expect(
        SyncCommandOutcomeSchema.safeParse(confirmedLinkedOutcome).success,
      ).toBe(true);
    });

    it("rejects a confirmed outcome with providerEventId but no providerVersion", () => {
      const outcome = { ...confirmedLinkedOutcome, providerVersion: null };
      expect(SyncCommandOutcomeSchema.safeParse(outcome).success).toBe(false);
    });

    it("rejects a confirmed outcome with providerVersion but no providerEventId", () => {
      const outcome = { ...confirmedLinkedOutcome, providerEventId: null };
      expect(SyncCommandOutcomeSchema.safeParse(outcome).success).toBe(false);
    });

    it.each(
      SyncCommandFailureReasonSchema.options,
    )("accepts a failed outcome with reason %s", (failureReason) => {
      const outcome = { state: "failed", failureReason };
      expect(SyncCommandOutcomeSchema.safeParse(outcome).success).toBe(true);
    });

    it("rejects a failed outcome missing a failureReason", () => {
      expect(
        SyncCommandOutcomeSchema.safeParse({ state: "failed" }).success,
      ).toBe(false);
    });

    it("rejects an unrecognized state", () => {
      expect(
        SyncCommandOutcomeSchema.safeParse({ state: "unknown" }).success,
      ).toBe(false);
    });
  });

  describe("SyncCommandSchema", () => {
    it("accepts a pending create command with no expectedVersion", () => {
      expect(SyncCommandSchema.safeParse(baseCommand()).success).toBe(true);
    });

    it("rejects a create command carrying an expectedVersion", () => {
      const command = baseCommand({ expectedVersion: "etag-0" });
      expect(SyncCommandSchema.safeParse(command).success).toBe(false);
    });

    it("accepts an update command with a stale expectedVersion under a versionConflict failure", () => {
      const command = baseCommand({
        input: updateInput(),
        expectedVersion: "etag-stale",
        outcome: { state: "failed", failureReason: "versionConflict" },
      });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("accepts an update command with a null expectedVersion for a not-yet-linked event", () => {
      const command = baseCommand({
        input: updateInput(),
        expectedVersion: null,
      });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("accepts a create command that ends up reconciling an ambiguous response", () => {
      const command = baseCommand({ outcome: { state: "reconciling" } });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("accepts a delete command rejected for targeting a read-only calendar", () => {
      const command = baseCommand({
        input: deleteInput(),
        outcome: { state: "failed", failureReason: "readOnlyCalendar" },
      });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("accepts a high attemptCount representing exhausted retries", () => {
      const command = baseCommand({ attemptCount: 40 });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("rejects a negative attemptCount", () => {
      const command = baseCommand({ attemptCount: -1 });
      expect(SyncCommandSchema.safeParse(command).success).toBe(false);
    });

    it("rejects a raw provider credential field", () => {
      const command = baseCommand({ accessToken: "leak" });
      expect(SyncCommandSchema.safeParse(command).success).toBe(false);
    });

    it("round-trips through JSON unchanged", () => {
      const command = baseCommand({
        input: updateInput("thisAndFollowing"),
        expectedVersion: "etag-1",
        outcome: confirmedLinkedOutcome,
      });
      const parsed = SyncCommandSchema.parse(command);
      expect(
        SyncCommandSchema.parse(JSON.parse(JSON.stringify(parsed))),
      ).toEqual(parsed);
    });

    it.each([
      "this",
      "thisAndFollowing",
    ] as const)("rejects a %s-scope command that omits a recurrenceId", (scope) => {
      const command = baseCommand({
        input: { ...updateInput(scope), recurrenceId: null },
      });
      expect(SyncCommandSchema.safeParse(command).success).toBe(false);
    });

    it("rejects an all-scope command that carries a recurrenceId", () => {
      const command = baseCommand({
        input: {
          ...deleteInput("all"),
          recurrenceId: "2026-07-14T09:00:00-06:00",
        },
      });
      expect(SyncCommandSchema.safeParse(command).success).toBe(false);
    });

    it("accepts a this-scope delete targeting one occurrence", () => {
      const command = baseCommand({ input: deleteInput("this") });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("accepts an rsvp command targeting one occurrence", () => {
      const command = baseCommand({ input: rsvpInput("this") });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("accepts a series-scoped rsvp command", () => {
      const command = baseCommand({ input: rsvpInput("all") });
      expect(SyncCommandSchema.safeParse(command).success).toBe(true);
    });

    it("rejects a this-scope rsvp command that omits a recurrenceId", () => {
      const command = baseCommand({
        input: { ...rsvpInput("this"), recurrenceId: null },
      });
      expect(SyncCommandSchema.safeParse(command).success).toBe(false);
    });

    it("rejects an all-scope rsvp command that carries a recurrenceId", () => {
      const command = baseCommand({
        input: {
          ...rsvpInput("all"),
          recurrenceId: "2026-07-14T09:00:00-06:00",
        },
      });
      expect(SyncCommandSchema.safeParse(command).success).toBe(false);
    });

    it("round-trips an update carrying attendeesEdit replace through JSON unchanged", () => {
      const command = baseCommand({
        input: { ...updateInput(), attendeesEdit: "replace" },
        expectedVersion: "etag-1",
        outcome: confirmedLinkedOutcome,
      });
      const parsed = SyncCommandSchema.parse(command);
      expect(parsed.input).toMatchObject({ attendeesEdit: "replace" });
      expect(
        SyncCommandSchema.parse(JSON.parse(JSON.stringify(parsed))),
      ).toEqual(parsed);
    });

    it("parses a legacy update command JSON without attendeesEdit with preserve", () => {
      // Fixture mirrors a stored pre-attendees command record: no
      // attendeesEdit anywhere. It must parse, and only gain the default.
      const legacy = JSON.parse(
        JSON.stringify(baseCommand({ input: updateInput() })),
      );
      const parsed = SyncCommandSchema.parse(legacy);
      expect(parsed.input).toMatchObject({ attendeesEdit: "preserve" });
    });
  });
});
