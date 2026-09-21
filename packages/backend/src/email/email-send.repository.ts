import { type ObjectId } from "mongodb";
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

const parseRecord = (record: unknown): EmailSendRecord =>
  EmailSendRecordSchema.parse(record);

const truncateError = (error: string): string => error.trim().slice(0, 500);

export type InsertEmailSendInput = Omit<
  EmailSendRecord,
  | "createdAt"
  | "updatedAt"
  | "attemptCount"
  | "lastError"
  | "providerMessageId"
  | "sentAt"
> & {
  attemptCount?: number;
  lastError?: string | null;
  providerMessageId?: string | null;
  sentAt?: Date | null;
};

class EmailSendRepository {
  async insertMany(rows: InsertEmailSendInput[]): Promise<void> {
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
        createdAt: now,
        updatedAt: now,
      }),
    );
    try {
      await mongoService.emailSend.insertMany(records, { ordered: false });
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
    const now = new Date();
    const result = await mongoService.emailSend.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: "sent",
          providerMessageId,
          sentAt: now,
          updatedAt: now,
          lastError: null,
        },
      },
      { returnDocument: "after" },
    );
    return result ? parseRecord(result) : null;
  }

  async markSkipped(
    id: string,
    reason: string,
  ): Promise<EmailSendRecord | null> {
    const now = new Date();
    const result = await mongoService.emailSend.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: "skipped",
          lastError: truncateError(reason),
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    return result ? parseRecord(result) : null;
  }

  async markCanceled(id: string): Promise<EmailSendRecord | null> {
    const now = new Date();
    const result = await mongoService.emailSend.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: "canceled",
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    return result ? parseRecord(result) : null;
  }

  async recordFailure(
    id: string,
    error: string,
    nextAttemptAt: Date,
  ): Promise<EmailSendRecord | null> {
    const existing = await mongoService.emailSend.findOne({ _id: id });
    if (!existing) {
      return null;
    }
    const parsed = parseRecord(existing);
    const attemptCount = parsed.attemptCount + 1;
    const now = new Date();
    const lastError = truncateError(error);
    if (attemptCount >= EMAIL_SEND_MAX_ATTEMPTS) {
      const result = await mongoService.emailSend.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            status: "failed",
            attemptCount,
            lastError,
            updatedAt: now,
          },
        },
        { returnDocument: "after" },
      );
      return result ? parseRecord(result) : null;
    }
    const result = await mongoService.emailSend.findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: "queued",
          attemptCount,
          lastError,
          nextAttemptAt,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    return result ? parseRecord(result) : null;
  }

  async cancelQueuedForUser(userId: ObjectId): Promise<number> {
    const now = new Date();
    const result = await mongoService.emailSend.updateMany(
      { userId, status: "queued" },
      { $set: { status: "canceled", updatedAt: now } },
    );
    return result.modifiedCount;
  }
}

export const emailSendRepository = new EmailSendRepository();
