import { type ObjectId } from "mongodb";
import { normalizeEmail } from "@core/util/email.util";
import mongoService from "@backend/common/services/mongo.service";
import { emailAnalytics } from "@backend/email/email.analytics";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { type EmailWebhookEvent } from "@backend/email/providers/email.port";
import { markUserSuppressed } from "@backend/email/services/email-suppression.service";

const isDuplicateKeyError = (error: unknown): boolean => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  ) {
    return true;
  }
  return false;
};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const readRecipient = (data: Record<string, unknown>): string | undefined => {
  const to = data["to"];
  if (Array.isArray(to) && typeof to[0] === "string") {
    return to[0];
  }
  return readString(to);
};

async function resolveUserForWebhookEvent(
  data: Record<string, unknown>,
): Promise<{ userId: ObjectId; recipient: string } | null> {
  const emailId = readString(data["email_id"]) ?? readString(data["id"]);
  if (emailId) {
    const row = await emailSendRepository.findByProviderMessageId(emailId);
    if (row) {
      const user = await mongoService.user.findOne({ _id: row.userId });
      if (user) {
        return { userId: row.userId, recipient: user.email };
      }
    }
  }

  const recipient = readRecipient(data);
  if (!recipient) {
    return null;
  }
  const normalized = normalizeEmail(recipient);
  const user = await mongoService.user.findOne({
    email: normalized,
  });
  if (!user?._id) {
    return null;
  }
  const ledgerRow = await mongoService.emailSend.findOne({ userId: user._id });
  if (!ledgerRow) {
    return null;
  }
  return { userId: user._id, recipient: user.email };
}

async function handleDelivered(data: Record<string, unknown>): Promise<void> {
  const emailId = readString(data["email_id"]) ?? readString(data["id"]);
  if (!emailId) {
    return;
  }
  await emailSendRepository.markDelivered(emailId);
}

async function handleSuppression(
  data: Record<string, unknown>,
  eventType: "email.bounced" | "email.complained",
): Promise<void> {
  const resolved = await resolveUserForWebhookEvent(data);
  if (!resolved) {
    return;
  }
  const recipient = readRecipient(data);
  if (
    recipient &&
    normalizeEmail(recipient) !== normalizeEmail(resolved.recipient)
  ) {
    return;
  }
  await markUserSuppressed(resolved.userId);
  const row = await mongoService.emailSend.findOne(
    { userId: resolved.userId },
    { sort: { updatedAt: -1 }, projection: { stepKey: 1 } },
  );
  const analyticsEvent =
    eventType === "email.bounced" ? "email_bounced" : "email_complained";
  void emailAnalytics.capture({
    event: analyticsEvent,
    userId: resolved.userId.toHexString(),
    step: row?.stepKey,
  });
}

export async function processEmailWebhookEvent(
  event: EmailWebhookEvent,
  eventId: string,
): Promise<void> {
  try {
    await mongoService.emailEvent.insertOne({
      _id: eventId,
      receivedAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return;
    }
    throw error;
  }

  try {
    const data = event.data ?? {};
    switch (event.type) {
      case "email.delivered":
        await handleDelivered(data);
        break;
      case "email.bounced":
        await handleSuppression(data, "email.bounced");
        break;
      case "email.complained":
        await handleSuppression(data, "email.complained");
        break;
      default:
        break;
    }
  } catch (error) {
    await mongoService.emailEvent.deleteOne({ _id: eventId });
    throw error;
  }
}
