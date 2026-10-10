import { ObjectId, type ObjectId as ObjectIdType } from "mongodb";
import { emailListIncludes, normalizeEmail } from "@core/util/email.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { isEmailSequenceStopped } from "@backend/email/email-unsubscribe";
import {
  buildWelcomeEnrollmentRows,
  type ScheduleProfile,
  WELCOME_SEQUENCE,
  type WelcomeSequenceUser,
} from "@backend/email/welcome-sequence";
import { isWelcomeEmailEnabled } from "@backend/email/welcome-sequence.enrollment";
import { createHash } from "node:crypto";

export const PREVIEW_LOOP_ROW_ID_PREFIX = "preview-loop:" as const;
export const DEFAULT_PREVIEW_LOOP_GAP_DAYS = 1;
export const DEFAULT_PREVIEW_LOOP_MAX_PER_DAY = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isPreviewLoopEnabled(): boolean {
  return (
    isWelcomeEmailEnabled() && CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS.length > 0
  );
}

export function isPreviewLoopRecipient(email: string): boolean {
  return emailListIncludes(CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS, email);
}

export function previewLoopScheduleProfile(): ScheduleProfile {
  return (
    CONFIG.EMAIL_PREVIEW_LOOP_SCHEDULE_PROFILE ??
    CONFIG.EMAIL_SCHEDULE_PROFILE ??
    "real"
  );
}

export function previewLoopGapMs(): number {
  const days =
    CONFIG.EMAIL_PREVIEW_LOOP_GAP_DAYS ?? DEFAULT_PREVIEW_LOOP_GAP_DAYS;
  return days * DAY_MS;
}

export function previewLoopMaxEmailsPerDay(): number {
  return (
    CONFIG.EMAIL_PREVIEW_LOOP_MAX_PER_DAY ?? DEFAULT_PREVIEW_LOOP_MAX_PER_DAY
  );
}

export function isPreviewLoopRow(row: EmailSendRecord): boolean {
  return row.previewLoop === true;
}

/** Preview loop sends every step, even when skipIf would skip a real user. */
export function welcomeUserForSkipIf(
  user: WelcomeSequenceUser,
  previewLoop: boolean,
): WelcomeSequenceUser {
  if (!previewLoop) {
    return user;
  }
  return {
    ...user,
    hasConnectedCalendar: false,
    billing: {
      subscriptionStatus: "trialing",
      stripeSubscriptionId:
        user.billing?.stripeSubscriptionId ?? "sub_preview_loop",
    },
  };
}

function previewLoopDigest(purpose: "" | "-user", email: string) {
  return createHash("sha256")
    .update(`compass-email-preview-loop${purpose}:${normalizeEmail(email)}`)
    .digest();
}

export function previewLoopEmailHash(email: string): string {
  return previewLoopDigest("", email).toString("hex").slice(0, 16);
}

/** Stable user id for preview sends when no Compass account exists yet. */
export function previewLoopSyntheticUserId(email: string): ObjectIdType {
  return new ObjectId(previewLoopDigest("-user", email).subarray(0, 12));
}

function previewLoopRecipientFilter(
  email: string,
  extra: Record<string, unknown> = {},
) {
  return {
    previewLoop: true as const,
    recipientEmail: normalizeEmail(email),
    ...extra,
  };
}

export function previewLoopRowId(
  email: string,
  generation: number,
  stepKey: string,
): string {
  return `${PREVIEW_LOOP_ROW_ID_PREFIX}${previewLoopEmailHash(email)}:${generation}:${stepKey}`;
}

export function previewFirstNameFromEmail(email: string): string {
  const local = normalizeEmail(email).split("@")[0] ?? "there";
  const segment = local.split(/[.+_-]/)[0] ?? local;
  if (!segment) {
    return "there";
  }
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export async function resolvePreviewLoopUserId(
  email: string,
): Promise<ObjectIdType> {
  const normalized = normalizeEmail(email);
  const existing = await mongoService.user.findOne(
    { email: normalized },
    { projection: { _id: 1 } },
  );
  if (existing?._id) {
    return existing._id;
  }
  return previewLoopSyntheticUserId(normalized);
}

async function ensurePreviewLoopUserDocument(
  email: string,
  userId: ObjectIdType,
): Promise<void> {
  const normalized = normalizeEmail(email);
  const firstName = previewFirstNameFromEmail(normalized);
  await mongoService.user.updateOne(
    { _id: userId },
    {
      $setOnInsert: {
        email: normalized,
        firstName,
        lastName: "",
        name: firstName,
        locale: "en",
        signedUpAt: new Date(),
      },
    },
    { upsert: true },
  );
}

function buildPreviewLoopEnrollmentRows(
  email: string,
  userId: ObjectIdType,
  generation: number,
  anchorAt: Date,
  profile: ScheduleProfile,
) {
  const normalized = normalizeEmail(email);
  const baseRows = buildWelcomeEnrollmentRows(userId, anchorAt, profile);
  return baseRows.map((row) => ({
    ...row,
    _id: previewLoopRowId(normalized, generation, row.stepKey),
    previewLoop: true as const,
    recipientEmail: normalized,
    previewLoopGeneration: generation,
  }));
}

async function countPreviewLoopSentSince(
  recipientEmail: string,
  since: Date,
): Promise<number> {
  return mongoService.emailSend.countDocuments(
    previewLoopRecipientFilter(recipientEmail, {
      status: "sent",
      sentAt: { $gte: since },
    }),
  );
}

export async function deferPreviewLoopDailyCap(
  row: EmailSendRecord,
  now: Date,
): Promise<void> {
  const deferUntil = new Date(now.getTime() + DAY_MS);
  await emailSendRepository.deferNextAttempt(row._id, deferUntil);
}

export async function isPreviewLoopOverDailyCap(
  recipientEmail: string,
  now: Date,
): Promise<boolean> {
  const since = new Date(now.getTime() - DAY_MS);
  const sentCount = await countPreviewLoopSentSince(recipientEmail, since);
  return sentCount >= previewLoopMaxEmailsPerDay();
}

async function findLatestPreviewGeneration(
  recipientEmail: string,
): Promise<number | null> {
  const row = await mongoService.emailSend.findOne(
    previewLoopRecipientFilter(recipientEmail),
    {
      sort: { previewLoopGeneration: -1 },
      projection: { previewLoopGeneration: 1 },
    },
  );
  return row?.previewLoopGeneration ?? null;
}

async function generationHasQueuedRows(
  recipientEmail: string,
  generation: number,
): Promise<boolean> {
  const queued = await mongoService.emailSend.findOne(
    previewLoopRecipientFilter(recipientEmail, {
      previewLoopGeneration: generation,
      status: "queued",
    }),
  );
  return queued !== null;
}

async function generationIsComplete(
  recipientEmail: string,
  generation: number,
): Promise<boolean> {
  const rows = await mongoService.emailSend
    .find(
      previewLoopRecipientFilter(recipientEmail, {
        previewLoopGeneration: generation,
      }),
    )
    .toArray();
  if (rows.length < WELCOME_SEQUENCE.length) {
    return false;
  }
  return rows.every((row) => row.status === "sent" || row.status === "skipped");
}

async function lastSentAtForGeneration(
  recipientEmail: string,
  generation: number,
): Promise<Date | null> {
  const row = await mongoService.emailSend.findOne(
    previewLoopRecipientFilter(recipientEmail, {
      previewLoopGeneration: generation,
      status: "sent",
    }),
    { sort: { sentAt: -1 }, projection: { sentAt: 1 } },
  );
  return row?.sentAt ?? null;
}

export async function enqueuePreviewLoopGeneration(
  email: string,
  generation: number,
  anchorAt: Date,
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isPreviewLoopRecipient(normalized)) {
    return;
  }
  const userId = await resolvePreviewLoopUserId(normalized);
  await ensurePreviewLoopUserDocument(normalized, userId);
  const profile = previewLoopScheduleProfile();
  const rows = buildPreviewLoopEnrollmentRows(
    normalized,
    userId,
    generation,
    anchorAt,
    profile,
  );
  await emailSendRepository.insertMany(rows);
}

export async function ensurePreviewLoopForRecipient(
  email: string,
  now: Date = new Date(),
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isPreviewLoopRecipient(normalized)) {
    return;
  }

  const userId = await resolvePreviewLoopUserId(normalized);
  const user = await mongoService.user.findOne(
    { _id: userId },
    { projection: { emailPreferences: 1 } },
  );
  if (user && isEmailSequenceStopped(user.emailPreferences)) {
    return;
  }

  const latestGeneration = await findLatestPreviewGeneration(normalized);
  if (latestGeneration === null) {
    await enqueuePreviewLoopGeneration(normalized, 1, now);
    return;
  }

  if (await generationHasQueuedRows(normalized, latestGeneration)) {
    return;
  }

  if (!(await generationIsComplete(normalized, latestGeneration))) {
    return;
  }

  const lastSentAt = await lastSentAtForGeneration(
    normalized,
    latestGeneration,
  );
  if (!lastSentAt) {
    return;
  }

  const nextStartAt = new Date(lastSentAt.getTime() + previewLoopGapMs());
  if (now.getTime() < nextStartAt.getTime()) {
    return;
  }

  await enqueuePreviewLoopGeneration(normalized, latestGeneration + 1, now);
}

export async function ensurePreviewLoopEnrollments(
  now: Date = new Date(),
): Promise<void> {
  if (!isPreviewLoopEnabled()) {
    return;
  }
  for (const recipient of CONFIG.EMAIL_PREVIEW_LOOP_RECIPIENTS) {
    await ensurePreviewLoopForRecipient(recipient, now);
  }
}

export async function handlePreviewLoopAfterSend(
  row: EmailSendRecord,
  now: Date = new Date(),
): Promise<void> {
  if (!isPreviewLoopRow(row) || !row.recipientEmail) {
    return;
  }
  const lastStepKey = WELCOME_SEQUENCE[WELCOME_SEQUENCE.length - 1]?.key;
  if (row.stepKey !== lastStepKey) {
    return;
  }
  await ensurePreviewLoopForRecipient(row.recipientEmail, now);
}
