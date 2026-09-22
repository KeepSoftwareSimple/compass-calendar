import { z } from "zod/v4";
import { CalendarIdSchema, EventIdSchema } from "@core/types/domain-primitives";
import { ConnectionIdSchema } from "@core/types/sync/identity.contracts";

export const EventChangeMessageSchema = z.strictObject({
  type: z.literal("eventsChanged"),
  calendarId: CalendarIdSchema,
  eventIds: z.array(EventIdSchema),
  reason: z.enum(["created", "updated", "deleted", "reconciled"]),
});
export type EventChangeMessage = z.infer<typeof EventChangeMessageSchema>;

export const CalendarChangeMessageSchema = z.strictObject({
  type: z.literal("calendarsChanged"),
  calendarIds: z.array(CalendarIdSchema),
});
export type CalendarChangeMessage = z.infer<typeof CalendarChangeMessageSchema>;

const SyncStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("syncing") }),
  z.strictObject({ status: z.literal("healthy") }),
  z.strictObject({
    status: z.literal("attention"),
    code: z.enum([
      "CONNECTION_REVOKED",
      "IMPORT_FAILED",
      "WATCH_REPAIR_FAILED",
    ]),
    connectionId: ConnectionIdSchema.optional(),
    retryable: z.boolean(),
  }),
]);

export const SyncStatusMessageSchema = z.strictObject({
  type: z.literal("syncStatusChanged"),
  sync: SyncStateSchema,
});
export type SyncStatusMessage = z.infer<typeof SyncStatusMessageSchema>;

export const ImportResultMessageSchema = z.strictObject({
  type: z.literal("importCompleted"),
  operation: z.enum(["full", "incremental", "repair"]),
  eventsCount: z.number().int().nonnegative(),
  calendarsCount: z.number().int().nonnegative(),
});
export type ImportResultMessage = z.infer<typeof ImportResultMessageSchema>;

// Wraps the user-metadata payload the backend already replays on SSE connect;
// the account summary consumes it. The legacy UserMetadata is a plain TS
// interface with no Zod schema, so implementation should model only the fields
// the web actually reads and validate those.
export const UserMetadataMessageSchema = z.strictObject({
  type: z.literal("userMetadataChanged"),
  metadata: z.record(z.string(), z.unknown()),
});
export type UserMetadataMessage = z.infer<typeof UserMetadataMessageSchema>;

// Completeness rule (A27): every backend publish site emits a member of this
// union. The five current SSE names (EVENT_CHANGED, IMPORT_GCAL_START,
// IMPORT_GCAL_END, USER_METADATA) each map to a member or are
// explicitly retired; a contract test enforces the mapping.
export const ServerMessageSchema = z.discriminatedUnion("type", [
  EventChangeMessageSchema,
  CalendarChangeMessageSchema,
  SyncStatusMessageSchema,
  ImportResultMessageSchema,
  UserMetadataMessageSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export function revokedConnectionServerMessages(
  connectionId: string,
): ServerMessage[] {
  const parsedId = ConnectionIdSchema.parse(connectionId);
  return [
    {
      type: "syncStatusChanged",
      sync: {
        status: "attention",
        code: "CONNECTION_REVOKED",
        connectionId: parsedId,
        retryable: false,
      },
    },
  ];
}
