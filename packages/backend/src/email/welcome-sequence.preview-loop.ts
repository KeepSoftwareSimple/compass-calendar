import { ObjectId, type ObjectId as ObjectIdType } from "mongodb";
import { emailListIncludes, normalizeEmail } from "@core/util/email.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { isEmailSequenceStopped } from "@backend/email/email-unsubscribe";
import {
  buildWelcomeEnrollmentRows,
  isWelcomeStepKey,
  type ScheduleProfile,
  WELCOME_SEQUENCE,
  type WelcomeSequenceUser,
} from "@backend/email/welcome-sequence";
import { isWelcomeEmailEnabled } from "@backend/email/welcome-sequence.enrollment";
import {
  nextPreviewLoopMonthlyStart,
  nextPreviewLoopMonthlyStartAfterCompletion,
} from "@backend/email/welcome-sequence.preview-loop.schedule";
import { createHash } from "node:crypto";

const PREVIEW_LOOP_ROW_ID_PREFIX = "preview-loop:" as const;
const DEFAULT_PREVIEW_LOOP_MAX_PER_DAY = 10;
const DUPLICATE_GENERATION_SKIP_REASON =
  "Duplicate preview generation retired" as const;
const AWAITING_MONTHLY_PREVIEW_SKIP_REASON =
  "Awaiting monthly preview window" as const;

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

function previewLoopEmailHash(email: string): string {
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
  normalizedEmail: string,
  userId: ObjectIdType,
): Promise<void> {
  const firstName = previewFirstNameFromEmail(normalizedEmail);
  await mongoService.user.updateOne(
    { _id: userId },
    {
      $setOnInsert: {
        email: normalizedEmail,
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
  normalizedEmail: string,
  userId: ObjectIdType,
  generation: number,
  anchorAt: Date,
  profile: ScheduleProfile,
) {
  const baseRows = buildWelcomeEnrollmentRows(userId, anchorAt, profile);
  return baseRows.map((row) => ({
    ...row,
    _id: previewLoopRowId(normalizedEmail, generation, row.stepKey),
    previewLoop: true as const,
    recipientEmail: normalizedEmail,
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

async function findQueuedPreviewGenerations(
  recipientEmail: string,
): Promise<number[]> {
  const rows = await mongoService.emailSend
    .find(previewLoopRecipientFilter(recipientEmail, { status: "queued" }), {
      projection: { previewLoopGeneration: 1 },
    })
    .toArray();
  const generations = new Set<number>();
  for (const row of rows) {
    if (row.previewLoopGeneration !== undefined) {
      generations.add(row.previewLoopGeneration);
    }
  }
  return [...generations].sort((a, b) => a - b);
}

async function previewGenerationHasRows(
  recipientEmail: string,
  generation: number,
): Promise<boolean> {
  const row = await mongoService.emailSend.findOne(
    previewLoopRecipientFilter(recipientEmail, {
      previewLoopGeneration: generation,
    }),
    { projection: { _id: 1 } },
  );
  return row !== null;
}

async function skipPreviewLoopQueuedRows(
  recipientEmail: string,
  now: Date,
  lastError: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await mongoService.emailSend.updateMany(
    previewLoopRecipientFilter(recipientEmail, {
      status: "queued",
      ...extra,
    }),
    {
      $set: {
        status: "skipped",
        lastError,
        updatedAt: now,
      },
    },
  );
}

/** Clears queued preview rows until the next 1st-at-8:00-Denver window opens. */
export async function pausePreviewLoopUntilMonthlyStart(
  recipientEmail: string,
  now: Date,
): Promise<void> {
  const nextStart = nextPreviewLoopMonthlyStart(now);
  if (now.getTime() >= nextStart.getTime()) {
    return;
  }
  await skipPreviewLoopQueuedRows(
    recipientEmail,
    now,
    AWAITING_MONTHLY_PREVIEW_SKIP_REASON,
  );
}

/**
 * At most one generation may have queued rows. Extra generations are skipped
 * so restarts and competing pollers cannot double-send the same step.
 */
export async function dedupePreviewLoopQueuedGenerations(
  recipientEmail: string,
  now: Date,
): Promise<void> {
  const queuedGenerations = await findQueuedPreviewGenerations(recipientEmail);
  if (queuedGenerations.length <= 1) {
    return;
  }
  await skipPreviewLoopQueuedRows(
    recipientEmail,
    now,
    DUPLICATE_GENERATION_SKIP_REASON,
    { previewLoopGeneration: { $in: queuedGenerations.slice(1) } },
  );
}

interface PreviewGenerationState {
  /**
   * Every step of the sequence reached a terminal sent / skipped state, so a
   * queued step still waiting to send leaves this false.
   */
  isComplete: boolean;
  lastSentAt: Date | null;
  /**
   * The generation was enrolled under an older step list (it holds a step key
   * the sequence no longer has). Queued rows are retired and the next
   * generation starts immediately.
   */
  isStale: boolean;
}

/**
 * One read of the generation's rows answers every question the loop asks of
 * it. Asking Mongo separately re-read the same handful of documents three
 * times per recipient per tick.
 */
async function readPreviewGenerationState(
  recipientEmail: string,
  generation: number,
): Promise<PreviewGenerationState> {
  const rows = await mongoService.emailSend
    .find(
      previewLoopRecipientFilter(recipientEmail, {
        previewLoopGeneration: generation,
      }),
      { projection: { status: 1, sentAt: 1, stepKey: 1 } },
    )
    .toArray();

  const sentTimes = rows.flatMap((row) =>
    row.status === "sent" && row.sentAt ? [row.sentAt.getTime()] : [],
  );

  return {
    isStale: rows.some((row) => !isWelcomeStepKey(row.stepKey)),
    isComplete:
      rows.length >= WELCOME_SEQUENCE.length &&
      rows.every((row) => row.status === "sent" || row.status === "skipped"),
    lastSentAt: sentTimes.length > 0 ? new Date(Math.max(...sentTimes)) : null,
  };
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
  if (await previewGenerationHasRows(normalized, generation)) {
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

async function enqueuePreviewLoopAtMonthlyStart(
  email: string,
  generation: number,
  now: Date,
): Promise<void> {
  await enqueuePreviewLoopGeneration(
    email,
    generation,
    nextPreviewLoopMonthlyStart(now),
  );
}

export async function ensurePreviewLoopForRecipient(
  email: string,
  now: Date = new Date(),
): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!isPreviewLoopRecipient(normalized)) {
    return;
  }

  // The preview user document is upserted with this address, so one lookup by
  // email is enough to see whether the recipient unsubscribed.
  const user = await mongoService.user.findOne(
    { email: normalized },
    { projection: { emailPreferences: 1 } },
  );
  if (user && isEmailSequenceStopped(user.emailPreferences)) {
    return;
  }

  await dedupePreviewLoopQueuedGenerations(normalized, now);
  await pausePreviewLoopUntilMonthlyStart(normalized, now);

  const latestGeneration = await findLatestPreviewGeneration(normalized);
  if (latestGeneration === null) {
    await enqueuePreviewLoopAtMonthlyStart(normalized, 1, now);
    return;
  }

  const generation = await readPreviewGenerationState(
    normalized,
    latestGeneration,
  );
  if (generation.isStale) {
    // Rows from a retired step list can sit queued for days (their sendAt is
    // still in the future). Retire them now so the new sequence starts fresh.
    await skipPreviewLoopQueuedRows(
      normalized,
      now,
      "Retired welcome step list",
      { previewLoopGeneration: latestGeneration },
    );
    await enqueuePreviewLoopAtMonthlyStart(
      normalized,
      latestGeneration + 1,
      now,
    );
    return;
  }
  if (!generation.isComplete) {
    return;
  }

  const nextStartAt = nextPreviewLoopMonthlyStartAfterCompletion(
    generation.lastSentAt ?? now,
  );
  if (now.getTime() < nextStartAt.getTime()) {
    return;
  }

  await enqueuePreviewLoopGeneration(
    normalized,
    latestGeneration + 1,
    nextStartAt,
  );
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
