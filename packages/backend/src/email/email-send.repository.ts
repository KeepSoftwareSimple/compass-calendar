import {
  type ClientSession,
  type Filter,
  type MatchKeysAndValues,
  type ObjectId,
} from "mongodb";
import mongoService from "@backend/common/services/mongo.service";
import { EMAIL_SEND_MAX_ATTEMPTS } from "@backend/email/email.constants";
import {
  type EmailSendRecord,
  EmailSendRecordSchema,
} from "@backend/email/email-send.record";

const isDuplicateKeyError = (error: unknown): boolean => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  ) {
    return true;
  }
  const writeErrors = (
    error as { writeErrors?: readonly { code?: unknown }[] } | null
  )?.writeErrors;
  if (!writeErrors?.length) {
    return false;
  }
  return writeErrors.every((entry) => entry.code === 11000);
};

const parseRecord = (record: { deliveredAt?: Date | null }): EmailSendRecord =>
  EmailSendRecordSchema.parse({
    ...record,
    deliveredAt: record.deliveredAt ?? null,
  });

const truncateError = (error: string): string => error.trim().slice(0, 500);

/**
 * The write every status transition below makes: patch the matched row and
 * return it parsed, or null when nothing matched (another attempt already
 * settled it, or the filter's own guard excluded the row). `updatedAt` moves
 * with every patch, and `fields` receives that same instant so a transition
 * stamping its own timestamp records it identically.
 */
const patchRow = async (
  filter: Filter<EmailSendRecord>,
  fields: (now: Date) => MatchKeysAndValues<EmailSendRecord>,
): Promise<EmailSendRecord | null> => {
  const now = new Date();
  const result = await mongoService.emailSend.findOneAndUpdate(
    filter,
    { $set: { ...fields(now), updatedAt: now } },
    { returnDocument: "after" },
  );
  return result ? parseRecord(result) : null;
};

export type InsertEmailSendInput = Omit<
  EmailSendRecord,
  | "createdAt"
  | "updatedAt"
  | "attemptCount"
  | "lastError"
  | "providerMessageId"
  | "sentAt"
  | "deliveredAt"
> & {
  attemptCount?: number;
  lastError?: string | null;
  providerMessageId?: string | null;
  sentAt?: Date | null;
  deliveredAt?: Date | null;
};

class EmailSendRepository {
  async insertMany(
    rows: InsertEmailSendInput[],
    session?: ClientSession,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const now = new Date();
    const records = rows.map((row) =>
      EmailSendRecordSchema.parse({
        ...row,
        attemptCount: row.attemptCount ?? 0,
        lastError: row.lastError ?? null,
        providerMessageId: row.providerMessageId ?? null,
        sentAt: row.sentAt ?? null,
        deliveredAt: row.deliveredAt ?? null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    try {
      await mongoService.emailSend.insertMany(records, {
        ordered: false,
        session,
      });
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  async claimDue(
    now: Date,
    limit: number,
    leaseMs: number,
  ): Promise<EmailSendRecord[]> {
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const claimed: EmailSendRecord[] = [];
    for (let index = 0; index < limit; index += 1) {
      const result = await mongoService.emailSend.findOneAndUpdate(
        {
          status: "queued",
          nextAttemptAt: { $lte: now },
        },
        {
          $set: { nextAttemptAt: leaseUntil, updatedAt: now },
        },
        { sort: { nextAttemptAt: 1 }, returnDocument: "after" },
      );
      if (!result) {
        break;
      }
      claimed.push(parseRecord(result));
    }
    return claimed;
  }

  async markSent(
    id: string,
    providerMessageId: string,
  ): Promise<EmailSendRecord | null> {
    return patchRow({ _id: id }, (now) => ({
      status: "sent",
      providerMessageId,
      sentAt: now,
      lastError: null,
    }));
  }

  async markSkipped(
    id: string,
    reason: string,
  ): Promise<EmailSendRecord | null> {
    return patchRow({ _id: id }, () => ({
      status: "skipped",
      lastError: truncateError(reason),
    }));
  }

  async markCanceled(id: string): Promise<EmailSendRecord | null> {
    return patchRow({ _id: id }, () => ({ status: "canceled" }));
  }

  // One more attempt left requeues at `nextAttemptAt`; the last one fails
  // terminally. The attempt count is read first rather than $inc'd so the
  // decision and the stored count come from the same value.
  async recordFailure(
    id: string,
    error: string,
    nextAttemptAt: Date,
  ): Promise<EmailSendRecord | null> {
    const existing = await mongoService.emailSend.findOne({ _id: id });
    if (!existing) {
      return null;
    }
    const attemptCount = parseRecord(existing).attemptCount + 1;
    const lastError = truncateError(error);
    const exhausted = attemptCount >= EMAIL_SEND_MAX_ATTEMPTS;
    return patchRow({ _id: id }, () =>
      exhausted
        ? { status: "failed", attemptCount, lastError }
        : { status: "queued", attemptCount, lastError, nextAttemptAt },
    );
  }

  async deleteAllByUser(
    userId: ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const result = await mongoService.emailSend.deleteMany(
      { userId },
      { session },
    );
    return result.deletedCount;
  }

  async cancelQueuedForUser(userId: ObjectId): Promise<number> {
    const now = new Date();
    const result = await mongoService.emailSend.updateMany(
      { userId, status: "queued" },
      { $set: { status: "canceled", updatedAt: now } },
    );
    return result.modifiedCount;
  }

  async findByProviderMessageId(
    providerMessageId: string,
  ): Promise<EmailSendRecord | null> {
    const result = await mongoService.emailSend.findOne({ providerMessageId });
    return result ? parseRecord(result) : null;
  }

  // The `deliveredAt: null` guard makes this idempotent: a replayed provider
  // webhook matches nothing and returns null rather than restamping.
  async markDelivered(
    providerMessageId: string,
  ): Promise<EmailSendRecord | null> {
    return patchRow({ providerMessageId, deliveredAt: null }, (now) => ({
      deliveredAt: now,
    }));
  }
}

export const emailSendRepository = new EmailSendRepository();
