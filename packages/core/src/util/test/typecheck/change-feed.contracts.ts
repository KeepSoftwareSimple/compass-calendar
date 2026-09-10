import { z } from "zod/v4";
import { DateTimeSchema, EventIdSchema } from "@core/types/domain-primitives";
import { SyncEventCalendarIdSchema } from "@core/types/sync/event.contracts";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  ProviderCalendarIdSchema,
  SyncCommandIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

// Resumable internal change-feed contracts for Compass Sync.
// Compass API consumes this feed and translates it into typed browser SSE;
// it never appears in the browser directly. Invalidations carry only IDs and
// reasons, never event content — a client always refetches canonical state.

// Import progress must never imply completion from partial data:
// `complete` can only be true once every discovered calendar
// has finished, though the converse isn't required — a cursor-finalization
// pass may still be pending even after every calendar's window fills.
export const ImportProgressSchema = z
  .strictObject({
    calendarsTotal: z.number().int().min(0),
    calendarsCompleted: z.number().int().min(0),
    complete: z.boolean(),
  })
  .refine(
    (progress) => progress.calendarsCompleted <= progress.calendarsTotal,
    {
      message: "calendarsCompleted cannot exceed calendarsTotal",
      path: ["calendarsCompleted"],
    },
  )
  .refine(
    (progress) =>
      !progress.complete ||
      (progress.calendarsTotal > 0 &&
        progress.calendarsCompleted === progress.calendarsTotal),
    {
      message: "complete requires every discovered calendar to have finished",
      path: ["complete"],
    },
  );
export type ImportProgress = z.infer<typeof ImportProgressSchema>;

const ConnectionInvalidationSchema = z.strictObject({
  kind: z.literal("connection"),
  connectionId: ConnectionIdSchema,
});

const CalendarInvalidationSchema = z.strictObject({
  kind: z.literal("calendar"),
  connectionId: ConnectionIdSchema,
  calendarId: ProviderCalendarIdSchema,
});

const EventInvalidationSchema = z.strictObject({
  kind: z.literal("event"),
  eventId: EventIdSchema,
  // Needed so Compass API can emit typed browser `eventsChanged` without a
  // second Sync round-trip. Still content-free (ids only).
  calendarId: SyncEventCalendarIdSchema,
});

const CommandInvalidationSchema = z.strictObject({
  kind: z.literal("command"),
  commandId: SyncCommandIdSchema,
});

const ImportProgressInvalidationSchema = z.strictObject({
  kind: z.literal("importProgress"),
  connectionId: ConnectionIdSchema,
  progress: ImportProgressSchema,
});

export const SyncInvalidationSchema = z.discriminatedUnion("kind", [
  ConnectionInvalidationSchema,
  CalendarInvalidationSchema,
  EventInvalidationSchema,
  CommandInvalidationSchema,
  ImportProgressInvalidationSchema,
]);
export type SyncInvalidation = z.infer<typeof SyncInvalidationSchema>;

export const ChangeFeedCursorSchema = z.string().trim().min(1).max(1024);
export type ChangeFeedCursor = z.infer<typeof ChangeFeedCursorSchema>;

export const InvalidationEnvelopeSchema = z.strictObject({
  invalidation: SyncInvalidationSchema,
  emittedAt: DateTimeSchema,
});
export type InvalidationEnvelope = z.infer<typeof InvalidationEnvelopeSchema>;

// null means "resume from now" (no prior cursor, e.g. a fresh SSE
// connection). Tenant/principal scope always comes from the authenticated
// caller context, never from this request body.
export const ChangeFeedResumeQuerySchema = z.strictObject({
  cursor: ChangeFeedCursorSchema.nullable(),
});
export type ChangeFeedResumeQuery = z.infer<typeof ChangeFeedResumeQuerySchema>;

const ChangeFeedOkSchema = z.strictObject({
  kind: z.literal("ok"),
  invalidations: z.array(InvalidationEnvelopeSchema).readonly(),
  nextCursor: ChangeFeedCursorSchema,
});

// Sent when a resume cursor is no longer valid; the caller must invalidate
// all affected cached queries rather than trust a partial replay. Exported so
// the global (cross-tenant) feed's response union below can reuse it verbatim
// — "the cursor is stale" means the same thing on both feeds.
export const ChangeFeedResyncRequiredSchema = z.strictObject({
  kind: z.literal("resyncRequired"),
});

export const ChangeFeedResponseSchema = z.discriminatedUnion("kind", [
  ChangeFeedOkSchema,
  ChangeFeedResyncRequiredSchema,
]);
export type ChangeFeedResponse = z.infer<typeof ChangeFeedResponseSchema>;

// The global feed's envelope carries tenantId/principalId — unlike the
// per-principal feed above, where scope is implicit from the signed caller —
// so the one backend poller reading across every tenant can route each
// invalidation to the right user's SSE subscribers.
export const GlobalInvalidationEnvelopeSchema =
  InvalidationEnvelopeSchema.extend({
    tenantId: TenantIdSchema,
    principalId: PrincipalIdSchema,
  });
export type GlobalInvalidationEnvelope = z.infer<
  typeof GlobalInvalidationEnvelopeSchema
>;

const GlobalChangeFeedOkSchema = z.strictObject({
  kind: z.literal("ok"),
  invalidations: z.array(GlobalInvalidationEnvelopeSchema).readonly(),
  nextCursor: ChangeFeedCursorSchema,
});

export const GlobalChangeFeedResponseSchema = z.discriminatedUnion("kind", [
  GlobalChangeFeedOkSchema,
  ChangeFeedResyncRequiredSchema,
]);
export type GlobalChangeFeedResponse = z.infer<
  typeof GlobalChangeFeedResponseSchema
>;
