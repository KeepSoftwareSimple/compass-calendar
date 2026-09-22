import { z } from "zod/v4";
import { DateTimeSchema } from "@core/types/domain-primitives";

/**
 * Server-side welcome-email telemetry (welcome sequence v1 WP-05).
 *
 * Per-send events use the Compass user id as distinct id. The heartbeat uses
 * a fixed backend id so queue depth stays queryable without joining users.
 */
export const EMAIL_SEND_HEARTBEAT_EVENT = "email_send_heartbeat" as const;
/** Cadence of `email_send_heartbeat`. Dashboard alerts assume this. */
export const EMAIL_SEND_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;
export const EMAIL_LIFECYCLE_DISTINCT_ID = "compass-backend-email" as const;
export const EMAIL_LIFECYCLE_SERVICE = "compass-backend" as const;

export const EmailSendServerEventSchema = z.enum([
  "email_sent",
  "email_skipped",
  "email_failed",
  "email_bounced",
  "email_complained",
  "email_unsubscribed",
]);
export type EmailSendServerEvent = z.infer<typeof EmailSendServerEventSchema>;

export const EmailSendHeartbeatSchema = z.strictObject({
  environment: z.string().min(1),
  version: z.string().min(1),
  service: z.literal(EMAIL_LIFECYCLE_SERVICE),
  queued_count: z.number().int().nonnegative(),
  oldest_queued_age_ms: z.number().int().nonnegative().nullable(),
  failed_count_24h: z.number().int().nonnegative(),
  computedAt: DateTimeSchema,
});
export type EmailSendHeartbeat = z.infer<typeof EmailSendHeartbeatSchema>;
