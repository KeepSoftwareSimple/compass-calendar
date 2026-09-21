import { z } from "zod/v4";
import { DateTimeSchema, EventIdSchema } from "@core/types/domain-primitives";
import {
  EditableRecurrenceSchema,
  EventScheduleSchema,
} from "@core/types/event.contracts";
import { RsvpResponseStatusSchema } from "@core/types/event-attendance.contracts";
import {
  InvitationIntentValueSchema,
  RecurrenceEditSchema,
  RecurrenceScopeSchema,
} from "@core/types/event-command.contracts";
import {
  ClientEventIdSchema,
  ProviderEventVersionSchema,
  SyncEventCalendarIdSchema,
  SyncEventContentSchema,
} from "@core/types/sync/event.contracts";
import {
  IdempotencyKeySchema,
  PrincipalIdSchema,
  ProviderEventIdSchema,
  SyncCommandIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

// HTTP responses (and nested objects they contain) use z.object so a rolling
// deploy cannot 502 on a field the other side has not seen yet. Request
// bodies, command payloads, and upserts stay z.strictObject.

// Durable event command contracts for Compass Sync. A command
// records acknowledged user intent and is persisted before any asynchronous
// work begins. This file adds contracts only — nothing here executes a command
// or reads/writes the existing Compass API event endpoints.

// Whether writing this event to a provider should notify attendees. The choice
// is the user's (made in the UI when they created the event), carried on the
// command so Sync honors it rather than deciding. Defaults to notifying no one
// — the safe choice for a create with no attendees or no provider target.
export const InvitationIntentSchema =
  InvitationIntentValueSchema.default("none");
export type InvitationIntent = z.infer<typeof InvitationIntentSchema>;

// Whether this write replaces the event's guest membership with the command
// content's attendee set ("replace"), or leaves whatever the provider
// currently has untouched ("preserve" — today's behavior). The default is the
// backward-compat guarantee: every stored command and legacy caller parses
// unchanged and keeps behaving exactly as before.
const AttendeesEditSchema = z.enum(["replace", "preserve"]).default("preserve");

// create has no calendar to move within and no prior scope to preserve, so
// its recurrence input reuses the existing single/series edit shape.
// clientEventId carries the stable device-event identity when an anonymous
// event is promoted to a cloud account, so the same device event stays
// traceable across promotion; it is absent (null) for a plain cloud create.
const CreateCommandInputSchema = z.strictObject({
  kind: z.literal("create"),
  calendarId: SyncEventCalendarIdSchema,
  clientEventId: ClientEventIdSchema.nullable().default(null),
  invitation: InvitationIntentSchema,
  attendeesEdit: AttendeesEditSchema,
  createConference: z.boolean().default(false),
  guestsCanInviteOthers: z.boolean().optional(),
  content: SyncEventContentSchema,
  schedule: EventScheduleSchema,
  recurrence: EditableRecurrenceSchema,
});

// update never changes the owning calendar — that is exclusively the "move"
// operation's job, so the two stay independently retryable and idempotent.
// invitation carries the user's choice of whether to notify attendees of the
// edit, same as create; default is to notify no one.
//
// content and schedule are independently optional so a caller can change one
// without restating the other. Omitting a field means "keep what is already
// stored / at the provider". A replace of guest membership still needs
// content. Envelope refinements reject an update that carries neither field.
const UpdateCommandInputSchema = z.strictObject({
  kind: z.literal("update"),
  invitation: InvitationIntentSchema,
  attendeesEdit: AttendeesEditSchema,
  content: SyncEventContentSchema.optional(),
  schedule: EventScheduleSchema.optional(),
  recurrence: RecurrenceEditSchema,
  scope: RecurrenceScopeSchema,
  // Which occurrence a this/thisAndFollowing scope targets: the instance's
  // original scheduled start (its recurrence identity). Null for scope "all"
  // and for a single event, which have no one occurrence to address.
  recurrenceId: DateTimeSchema.nullable().default(null),
});

const MoveCommandInputSchema = z.strictObject({
  kind: z.literal("move"),
  calendarId: SyncEventCalendarIdSchema,
});

const DeleteCommandInputSchema = z.strictObject({
  kind: z.literal("delete"),
  // Whether to notify attendees of the cancellation, same as create/update;
  // default is to notify no one.
  invitation: InvitationIntentSchema,
  scope: RecurrenceScopeSchema,
  // Which occurrence a this/thisAndFollowing scope targets (see update above).
  // Null for scope "all" and for a single event.
  recurrenceId: DateTimeSchema.nullable().default(null),
});

// rsvp rewrites only the caller's own attendee entry (matched by the
// connection's account email), so it is its own kind rather than an overloaded
// update: it carries no content and never emails anyone (executed with
// sendUpdates "none"). `needsAction` is unrepresentable by design — a user
// answers, they don't un-answer. Targeting reuses update's scope/recurrenceId
// fields so composite occurrence ids (`eventId::recurrenceId`) resolve exactly
// the way they do for update and delete.
const RsvpCommandInputSchema = z.strictObject({
  kind: z.literal("rsvp"),
  responseStatus: RsvpResponseStatusSchema,
  scope: RecurrenceScopeSchema,
  // Which occurrence a this/thisAndFollowing scope targets (see update above).
  // Null for scope "all" and for a single event.
  recurrenceId: DateTimeSchema.nullable().default(null),
});

export const SyncCommandInputSchema = z.discriminatedUnion("kind", [
  CreateCommandInputSchema,
  UpdateCommandInputSchema,
  MoveCommandInputSchema,
  DeleteCommandInputSchema,
  RsvpCommandInputSchema,
]);
export type SyncCommandInput = z.infer<typeof SyncCommandInputSchema>;

// A this/thisAndFollowing scope targets one occurrence, so it must carry a
// recurrenceId; scope "all" targets the whole series, so it must not. Enforced
// on the request and command envelopes rather than the input union so the union
// stays a clean discriminated union (a refined member can't discriminate).
// rsvp opts in: it addresses occurrences with the same scope/recurrenceId
// fields, so it obeys the same coherence rule.
const recurrenceTargetIsCoherent = (input: SyncCommandInput): boolean => {
  if (
    input.kind !== "update" &&
    input.kind !== "delete" &&
    input.kind !== "rsvp"
  ) {
    return true;
  }
  return (input.scope === "all") === (input.recurrenceId === null);
};
const RECURRENCE_TARGET_MESSAGE =
  "recurrenceId is required for scope this/thisAndFollowing and must be null for scope all";

const updateCarriesContentOrSchedule = (input: SyncCommandInput): boolean =>
  input.kind !== "update" ||
  input.content !== undefined ||
  input.schedule !== undefined;

const UPDATE_INTENT_MESSAGE = "An update must carry content, schedule, or both";

const replaceUpdateCarriesContent = (input: SyncCommandInput): boolean =>
  input.kind !== "update" ||
  input.attendeesEdit !== "replace" ||
  input.content !== undefined;

const REPLACE_UPDATE_CONTENT_MESSAGE = "A replace update must carry content";

// Provider-side rejection classes a command outcome can carry. These map to
// the sync failure classification; "capability" failures are typed rather than
// a silently degraded write in the provider adapter contract.
export const SyncCommandFailureReasonSchema = z.enum([
  "versionConflict",
  "readOnlyCalendar",
  "unsupportedCapability",
  "permanentProviderError",
  "authorizationRevoked",
]);
export type SyncCommandFailureReason = z.infer<
  typeof SyncCommandFailureReasonSchema
>;

// Nonterminal: pending (persisted, not yet attempted), applying (in flight
// at the provider), reconciling (response was ambiguous; identity must be
// confirmed before another attempt).
// Terminal: confirmed, failed, cancelled.
const PendingOutcomeSchema = z.object({ state: z.literal("pending") });
const ApplyingOutcomeSchema = z.object({ state: z.literal("applying") });
const ReconcilingOutcomeSchema = z.object({
  state: z.literal("reconciling"),
});

const ConfirmedOutcomeSchema = z
  .object({
    state: z.literal("confirmed"),
    // Both null when the event has no provider target: confirmation is
    // durable cloud persistence only.
    // Otherwise both present together — a provider identity without a
    // version (or vice versa) is not a coherent confirmed state.
    providerEventId: ProviderEventIdSchema.nullable(),
    providerVersion: ProviderEventVersionSchema.nullable(),
  })
  .refine(
    (outcome) =>
      (outcome.providerEventId === null) === (outcome.providerVersion === null),
    {
      message:
        "providerEventId and providerVersion must both be null or both present",
      path: ["providerVersion"],
    },
  );

const FailedOutcomeSchema = z.object({
  state: z.literal("failed"),
  failureReason: SyncCommandFailureReasonSchema,
});

const CancelledOutcomeSchema = z.object({
  state: z.literal("cancelled"),
});

export const SyncCommandOutcomeSchema = z.discriminatedUnion("state", [
  PendingOutcomeSchema,
  ApplyingOutcomeSchema,
  ReconcilingOutcomeSchema,
  ConfirmedOutcomeSchema,
  FailedOutcomeSchema,
  CancelledOutcomeSchema,
]);
export type SyncCommandOutcome = z.infer<typeof SyncCommandOutcomeSchema>;

export const SyncCommandSchema = z
  .object({
    id: SyncCommandIdSchema,
    tenantId: TenantIdSchema,
    principalId: PrincipalIdSchema,
    // Unique per (tenantId, principalId, idempotencyKey) — the same key
    // always refers to the same command.
    idempotencyKey: IdempotencyKeySchema,
    eventId: EventIdSchema,
    input: SyncCommandInputSchema,
    // Last provider version the client observed, for a conditional write on
    // update/move/delete. Null means no known provider version yet (an
    // unlinked event, or a first write attempt). Never present on create,
    // which has no prior provider state to condition against.
    expectedVersion: ProviderEventVersionSchema.nullable(),
    outcome: SyncCommandOutcomeSchema,
    attemptCount: z.number().int().min(0),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  })
  .refine(
    (command) =>
      command.input.kind !== "create" || command.expectedVersion === null,
    {
      message: "A create command cannot carry an expectedVersion",
      path: ["expectedVersion"],
    },
  )
  .refine((command) => recurrenceTargetIsCoherent(command.input), {
    message: RECURRENCE_TARGET_MESSAGE,
    path: ["input", "recurrenceId"],
  })
  .refine((command) => updateCarriesContentOrSchedule(command.input), {
    message: UPDATE_INTENT_MESSAGE,
    path: ["input", "content"],
  })
  .refine((command) => replaceUpdateCarriesContent(command.input), {
    message: REPLACE_UPDATE_CONTENT_MESSAGE,
    path: ["input", "content"],
  });
export type SyncCommand = z.infer<typeof SyncCommandSchema>;

// What the trusted Compass API submits to durably record one command. The
// tenant and principal are deliberately NOT in the body — they come from the
// signed internal-auth context, so a caller can only ever write to its own
// principal. The idempotency key makes a retried submission map to the same
// command instead of creating a duplicate.
export const CommandSubmitRequestSchema = z
  .strictObject({
    idempotencyKey: IdempotencyKeySchema,
    eventId: EventIdSchema,
    input: SyncCommandInputSchema,
    expectedVersion: ProviderEventVersionSchema.nullable(),
    // Per-submission undo/redo replay intent (never persisted on the command
    // record itself) — see CreateEventInputSchema.restore in
    // event-command.contracts.ts. Lets a resubmission that collides with a
    // terminal command on the same idempotency key be reopened and
    // re-executed instead of short-circuited as a no-op replay.
    restore: z.literal(true).optional(),
  })
  .refine(
    (request) =>
      request.input.kind !== "create" || request.expectedVersion === null,
    {
      message: "A create command cannot carry an expectedVersion",
      path: ["expectedVersion"],
    },
  )
  .refine((request) => recurrenceTargetIsCoherent(request.input), {
    message: RECURRENCE_TARGET_MESSAGE,
    path: ["input", "recurrenceId"],
  })
  .refine((request) => updateCarriesContentOrSchedule(request.input), {
    message: UPDATE_INTENT_MESSAGE,
    path: ["input", "content"],
  })
  .refine((request) => replaceUpdateCarriesContent(request.input), {
    message: REPLACE_UPDATE_CONTENT_MESSAGE,
    path: ["input", "content"],
  });
export type CommandSubmitRequest = z.infer<typeof CommandSubmitRequestSchema>;

export const CommandSubmitResponseSchema = z.object({
  command: SyncCommandSchema,
});
export type CommandSubmitResponse = z.infer<typeof CommandSubmitResponseSchema>;
