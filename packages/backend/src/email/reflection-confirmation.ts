import { type WithId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import dayjs from "@core/util/date/dayjs";
import { CONFIG } from "@backend/common/constants/config.constants";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { nextReflectionSend } from "@backend/email/reflection-schedule";
import { type WelcomeEmailContentEntry } from "@backend/email/welcome-sequence.content";

export const REFLECTION_CONFIRMATION_STEP = "confirmation";

/** One confirmation per account, ever: the id makes repeat opt-ins a no-op. */
export async function enqueueReflectionConfirmation(
  user: WithId<Schema_User>,
  now = new Date(),
) {
  await emailSendRepository.insertMany([
    {
      _id: `reflection-confirmation:${user._id.toHexString()}`,
      userId: user._id,
      sequence: "reflection",
      stepKey: REFLECTION_CONFIRMATION_STEP,
      sendAt: now,
      nextAttemptAt: now,
      status: "queued",
      recipientEmail: user.email,
    },
  ]);
}

/** The bare sender address from `Name <address>`, so the copy names what to allow. */
const senderAddress = () =>
  CONFIG.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] ?? CONFIG.EMAIL_FROM;

export function reflectionConfirmationContent(
  timeZone: string,
  now = new Date(),
): WelcomeEmailContentEntry {
  const first = dayjs(nextReflectionSend(now, timeZone, "weekly"))
    .tz(timeZone)
    .format("dddd, MMMM D [at] h:mm A");
  const sender = senderAddress();
  return {
    subject: "You're signed up for weekly reflections",
    heading: "Your weekly reflection is on the way",
    paragraphs: [
      `Your first reflection arrives ${first} (${timeZone}), then every Sunday at 10:30 a.m.`,
      sender
        ? `It will come from ${sender}. Add that address to your contacts, or reply to this email, so it reaches your inbox and not your spam folder.`
        : "Add this sender to your contacts, or reply to this email, so it reaches your inbox and not your spam folder.",
      "You can pause reflections any time in Settings > Notifications, or with the unsubscribe link below.",
    ],
    cta: {
      label: "Manage notifications",
      href: `${CONFIG.FRONTEND_URL.replace(/\/$/, "")}/?settings=notifications`,
    },
  };
}
