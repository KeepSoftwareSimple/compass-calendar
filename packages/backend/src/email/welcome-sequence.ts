import { type ObjectId } from "mongodb";
import {
  type Schema_User,
  type Schema_UserBilling,
} from "@core/types/user.types";
import { type InsertEmailSendInput } from "@backend/email/email-send.repository";

export type ScheduleProfile = "real" | "fast";

export type WelcomeSequenceUser = {
  firstName?: string;
  hasConnectedCalendar: boolean;
  billing?: Schema_UserBilling;
  emailPreferences?: Schema_User["emailPreferences"];
};

export type EmailStep = {
  key: string;
  delayDays: number;
  skipIf?: (user: WelcomeSequenceUser) => boolean;
};

/**
 * The drip, and the single source of its step keys. `as const` is what lets
 * `WelcomeStepKey` fall out of this list, so the content map and the Resend
 * alias map are checked against it at compile time instead of being three
 * hand-maintained copies of the same five strings.
 */
export const WELCOME_SEQUENCE = [
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
    delayDays: 5,
    skipIf: (user) =>
      user.billing?.subscriptionStatus === "active" ||
      !user.billing?.stripeSubscriptionId,
  },
] as const satisfies readonly EmailStep[];

export type WelcomeStepKey = (typeof WELCOME_SEQUENCE)[number]["key"];

/**
 * Narrows a `stepKey` read back from an `email_sends` row. Rows outlive the
 * sequence: a step dropped from the list leaves queued rows behind, so every
 * lookup keyed by step goes through this rather than asserting the cast.
 */
export const isWelcomeStepKey = (value: string): value is WelcomeStepKey =>
  WELCOME_SEQUENCE.some((step) => step.key === value);

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
