import { DateTimeSchema } from "@core/types/domain-primitives";
import {
  EMAIL_LIFECYCLE_SERVICE,
  type EmailSendHeartbeat,
  EmailSendHeartbeatSchema,
} from "@core/types/email-lifecycle.contracts";

export function emailSendHeartbeatProperties(input: {
  environment: string;
  version: string;
  queuedCount: number;
  oldestQueuedSendAt: Date | null;
  failedCount24h: number;
  now?: Date;
}): EmailSendHeartbeat {
  const now = input.now ?? new Date();
  return EmailSendHeartbeatSchema.parse({
    environment: input.environment,
    version: input.version,
    service: EMAIL_LIFECYCLE_SERVICE,
    queued_count: input.queuedCount,
    oldest_queued_age_ms: input.oldestQueuedSendAt
      ? Math.max(0, now.getTime() - input.oldestQueuedSendAt.getTime())
      : null,
    failed_count_24h: input.failedCount24h,
    computedAt: DateTimeSchema.parse(now.toISOString()),
  });
}
