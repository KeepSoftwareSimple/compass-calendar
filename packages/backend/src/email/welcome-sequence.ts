import { type ObjectId } from "mongodb";
import {
  type Schema_User,
  type Schema_UserBilling,
} from "@core/types/user.types";
import { type InsertEmailSendInput } from "@backend/email/email-send.repository";

export type ScheduleProfile = "real" | "fast";

export type WelcomeSequenceUser = {
  hasConnectedCalendar: boolean;
  billing?: Schema_UserBilling;
  emailPreferences?: Schema_User["emailPreferences"];
};

export type EmailStep = {
  key: string;
  delayDays: number;
  skipIf?: (user: WelcomeSequenceUser) => boolean;
};

export const WELCOME_SEQUENCE: EmailStep[] = [
  { key: "welcome", delayDays: 0 },
  { key: "shortcuts", delayDays: 2 },
  {
    key: "connect-calendar",
    delayDays: 5,
    skipIf: (user) => user.hasConnectedCalendar,
  },
  { key: "booking", delayDays: 9 },
  {
    key: "trial-ending",
    delayDays: 12,
    skipIf: (user) => user.billing?.subscriptionStatus === "active",
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function stepDelayMs(step: EmailStep, profile: ScheduleProfile): number {
  const unitMs = profile === "fast" ? MINUTE_MS : DAY_MS;
  return step.delayDays * unitMs;
}

export function computeSendAt(
  signedUpAt: Date,
  step: EmailStep,
  profile: ScheduleProfile,
): Date {
  return new Date(signedUpAt.getTime() + stepDelayMs(step, profile));
}

export function buildWelcomeEnrollmentRows(
  userId: ObjectId,
  signedUpAt: Date,
  profile: ScheduleProfile,
): InsertEmailSendInput[] {
  return WELCOME_SEQUENCE.map((step) => {
    const sendAt = computeSendAt(signedUpAt, step, profile);
    return {
      _id: `${userId.toHexString()}:${step.key}`,
      userId,
      sequence: "welcome" as const,
      stepKey: step.key,
      status: "queued" as const,
      sendAt,
      nextAttemptAt: sendAt,
    };
  });
}

export function findWelcomeStep(stepKey: string): EmailStep | undefined {
  return WELCOME_SEQUENCE.find((step) => step.key === stepKey);
}
