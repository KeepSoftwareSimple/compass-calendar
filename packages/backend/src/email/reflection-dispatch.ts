import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { emailAnalytics } from "@backend/email/email.analytics";
import {
  EMAIL_SEND_PROVIDER_SPACING_MS,
  emailSendBackoffMs,
} from "@backend/email/email.constants";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  buildUnsubscribeTokenForUser,
  buildUnsubscribeUrls,
} from "@backend/email/email-unsubscribe";
import { type EmailProvider } from "@backend/email/providers/email.port";
import {
  prepareReflection,
  reflectionCalendarContext,
} from "@backend/email/reflection-context";
import { reflectionEligible } from "@backend/email/reflection-enrollment";
import { requestReflectionHistory } from "@backend/email/reflection-history";
import { reflectionExpiresAt } from "@backend/email/reflection-schedule";
import hiddenEventService from "@backend/user/services/hidden-event.service";
import { createHash } from "node:crypto";

export const hiddenEventsDigest = (ids: string[]) =>
  createHash("sha256")
    .update(JSON.stringify([...ids].sort()))
    .digest("hex");

export async function dispatchReflection(
  row: EmailSendRecord,
  provider: EmailProvider,
) {
  if (!(await emailSendRepository.isQueued(row._id))) return;
  const edition = row.reflection;
  const cancel = async (reason: string) => {
    const result = await mongoService.emailSend.updateOne(
      { _id: row._id, status: "queued" },
      {
        $set: { status: "skipped", lastError: reason, updatedAt: new Date() },
        $unset: { "reflection.prepared": "" },
      },
    );
    if (!result.matchedCount) return;
    void emailAnalytics.capture({
      event: "email_skipped",
      userId: row.userId.toHexString(),
      properties: { sequence: row.sequence, reason },
    });
  };
  if (!edition) {
    await cancel("Missing reflection edition");
    return;
  }
  if (edition.cadence !== "weekly") {
    await cancel("Reflection cadence changed to weekly");
    return;
  }
  if (new Date() >= reflectionExpiresAt(edition.date, edition.timeZone)) {
    await cancel("Reflection edition expired");
    return;
  }
  try {
    const user = await mongoService.user.findOne({ _id: row.userId });
    const recipient = user?.email;
    if (
      !user ||
      !reflectionEligible(user) ||
      !recipient ||
      recipient !== row.recipientEmail ||
      user.reflectionPreferences?.timeZone !== edition.timeZone
    ) {
      await cancel("Reflection enrollment changed");
      return;
    }
    if (
      CONFIG.EMAIL_ALLOWLIST.length &&
      !CONFIG.EMAIL_ALLOWLIST.some(
        (email) => email.toLowerCase() === recipient.toLowerCase(),
      )
    ) {
      await cancel("Recipient not allowlisted");
      return;
    }
    const token = buildUnsubscribeTokenForUser(row.userId.toHexString());
    if (!token) {
      await cancel("Reflection unsubscribe is not configured");
      return;
    }
    const unsubscribe = buildUnsubscribeUrls(token, "reflection");
    if (!edition.prepared) {
      const hiddenDigest = hiddenEventsDigest(
        await hiddenEventService.listHiddenEventIds(row.userId),
      );
      const prepared = {
        ...(await prepareReflection(row, user, unsubscribe.httpsUrl)),
        hiddenDigest,
      };
      await mongoService.emailSend.updateOne(
        {
          _id: row._id,
          status: "queued",
          "reflection.prepared": { $exists: false },
        },
        { $set: { "reflection.prepared": prepared } },
      );
    }
    const current = await mongoService.emailSend.findOne({
      _id: row._id,
      status: "queued",
    });
    const prepared = current?.reflection?.prepared;
    const fresh = await mongoService.user.findOne({ _id: row.userId });
    if (
      !prepared ||
      !fresh ||
      !reflectionEligible(fresh) ||
      new Date() >= reflectionExpiresAt(edition.date, edition.timeZone)
    ) {
      await cancel("Reflection no longer eligible");
      return;
    }
    const context = await reflectionCalendarContext(fresh);
    const hiddenDigest = hiddenEventsDigest(
      await hiddenEventService.listHiddenEventIds(row.userId),
    );
    if (
      !context.connectionsReady ||
      fresh.email !== recipient ||
      fresh.reflectionPreferences?.timeZone !== edition.timeZone ||
      JSON.stringify([...context.calendarIds].sort()) !==
        JSON.stringify([...prepared.calendarIds].sort()) ||
      hiddenDigest !== prepared.hiddenDigest ||
      (fresh.lifePreferences?.revision ?? 0) !== prepared.lifeRevision
    ) {
      await cancel("Reflection source settings changed");
      return;
    }
    if (!(await emailSendRepository.isQueued(row._id))) return;
    const lifeImage = prepared.pdfBase64
      ? {
          content: prepared.pdfBase64,
          ext: "pdf",
          type: "application/pdf",
        }
      : prepared.pngBase64
        ? {
            content: prepared.pngBase64,
            ext: "png",
            type: "image/png",
          }
        : null;
    const result = await provider.send({
      idempotencyKey: row._id,
      to: recipient,
      personal: true,
      subject: prepared.subject,
      html: prepared.html,
      text: prepared.text,
      headers: {
        "List-Unsubscribe": unsubscribe.listUnsubscribeHeader,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      ...(lifeImage
        ? {
            attachments: [
              {
                filename: `compass-life-in-weeks-${edition.date}.${lifeImage.ext}`,
                content: lifeImage.content,
                contentType: lifeImage.type,
              },
            ],
          }
        : {}),
    });
    await emailSendRepository.markSent(row._id, result.messageId);
    await mongoService.emailSend.updateOne(
      { _id: row._id, status: "sent" },
      {
        $set: { "reflection.memoryIds": prepared.memoryIds },
        $unset: { "reflection.prepared": "" },
      },
    );
    void emailAnalytics.capture({
      event: "email_sent",
      userId: row.userId.toHexString(),
      properties: { sequence: row.sequence, cadence: edition.cadence },
    });
  } catch (error) {
    // Provider errors can contain submitted event titles. Do not retain/log
    // them: only the two known, title-free causes get a specific reason.
    const reason = failureReason(error);
    if (reason === "history_incomplete") {
      const user = await mongoService.user.findOne({ _id: row.userId });
      if (user) void requestReflectionHistory(user);
    }
    const updated = await emailSendRepository.recordFailure(
      row._id,
      reason === "failed"
        ? "Reflection preparation or delivery failed"
        : reason,
      new Date(Date.now() + emailSendBackoffMs(row.attemptCount + 1)),
    );
    if (updated?.status === "failed")
      void emailAnalytics.capture({
        event: "email_failed",
        userId: row.userId.toHexString(),
        properties: { sequence: row.sequence, reason },
      });
  }
}

function failureReason(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Calendar history incomplete") return "history_incomplete";
  if (message === "Calendar connection needs attention")
    return "calendar_needs_attention";
  return "failed";
}

/** Prepare independent reviews concurrently; keep provider requests sequential. */
export async function dispatchReflectionBatch(
  rows: EmailSendRecord[],
  provider: EmailProvider,
) {
  const pause = () =>
    new Promise<void>((resolve) =>
      setTimeout(resolve, EMAIL_SEND_PROVIDER_SPACING_MS),
    );
  let sendQueue = Promise.resolve();
  const pacedProvider: EmailProvider = {
    ...provider,
    send(input) {
      const result = sendQueue.then(() => provider.send(input));
      // A provider failure must not poison the queue for later recipients.
      sendQueue = result.then(pause, pause);
      return result;
    },
  };
  let next = 0;
  const outcomes = await Promise.allSettled(
    Array.from({ length: Math.min(4, rows.length) }, async () => {
      while (next < rows.length) {
        const row = rows[next++]!;
        await dispatchReflection(row, pacedProvider);
      }
    }),
  );
  await sendQueue;
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
}
