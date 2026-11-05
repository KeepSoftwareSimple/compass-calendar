import { z } from "zod/v4";
import { DEFAULT_LIFESPAN } from "@core/life/life-math";
import { ReflectionPreferencesSchema } from "@core/types/life-preferences.contracts";
import { zObjectId } from "@core/types/object-id.schema";
import dayjs from "@core/util/date/dayjs";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { EmailSendRecordSchema } from "@backend/email/email-send.record";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  buildUnsubscribeTokenForUser,
  buildUnsubscribeUrls,
} from "@backend/email/email-unsubscribe";
import {
  prepareReflection,
  reflectionCalendarContext,
} from "@backend/email/reflection-context";
import { isReflectionTrialUser } from "@backend/email/reflection-enrollment";
import { reflectionSendAt } from "@backend/email/reflection-schedule";
import { saveLifePreferences } from "@backend/user/services/life-preferences.service";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const SetupSchema = ReflectionPreferencesSchema.omit({ enabled: true }).extend({
  recipientEmail: z.email(),
  birthDate: z.iso
    .date()
    .refine(
      (date) =>
        date >= "1900-01-01" && date <= new Date().toISOString().slice(0, 10),
    ),
});

export async function runReflectionCommand(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "user-id": { type: "string" },
      all: { type: "boolean", default: false },
      input: { type: "string" },
      apply: { type: "boolean", default: false },
      output: { type: "string" },
      date: { type: "string" },
      weekly: { type: "boolean", default: false },
    },
  });
  const action = positionals[0] ?? "status";
  if (
    !["setup", "status", "history", "preview", "enable", "disable"].includes(
      action,
    )
  )
    throw new Error(
      "Choose setup, status, history, preview, enable, or disable",
    );
  if (values.all && action !== "history")
    throw new Error("Only the history command supports --all");
  if (values.all && values["user-id"])
    throw new Error("Choose --all or --user-id");
  await mongoService.start();
  try {
    if (action === "setup") {
      if (!values.input)
        throw new Error(
          "Pass --input with a private JSON file containing recipientEmail, birthDate, timeZone, and optional excludedCalendarIds",
        );
      const input = SetupSchema.parse(await Bun.file(values.input).json());
      const matches = await mongoService.user
        .find({ email: input.recipientEmail.trim().toLowerCase() })
        .limit(2)
        .toArray();
      if (matches.length !== 1 || !matches[0] || matches[0].isSynthetic)
        throw new Error(
          "Expected exactly one existing real Compass account for this address",
        );
      const user = matches[0];
      console.log(
        `Resolved existing account ${user._id.toHexString()}. ${values.apply ? "Applying settings with delivery disabled." : "Dry run; use --apply to save settings with delivery disabled."}`,
      );
      if (values.apply) {
        const saved = await saveLifePreferences(user._id, {
          preferences: {
            birthDate: input.birthDate,
            lifespan:
              user.lifePreferences?.preferences?.lifespan ?? DEFAULT_LIFESPAN,
            variation:
              user.lifePreferences?.preferences?.variation ?? "average",
          },
          expectedRevision: user.lifePreferences?.revision ?? 0,
        });
        if (saved.conflict || !saved.value)
          throw new Error(
            "Life settings changed; inspect the account and retry",
          );
        await mongoService.user.updateOne(
          { _id: user._id },
          {
            $set: {
              reflectionPreferences: {
                enabled: false,
                timeZone: input.timeZone,
                excludedCalendarIds: input.excludedCalendarIds,
              },
            },
            $unset: { reflectionNextSendAt: "" },
          },
        );
      }
      return;
    }
    const id = values["user-id"] ?? CONFIG.REFLECTION_TRIAL_USER_ID;
    if (!values.all && !id)
      throw new Error("Pass --user-id or configure the private trial account");
    const users = mongoService.user
      .find(values.all ? {} : { _id: zObjectId.parse(id) })
      .batchSize(25);
    let found = 0;
    for await (const user of users) {
      found++;
      if (user.isSynthetic) continue;
      if (action === "enable" || action === "disable") {
        if (
          action === "enable" &&
          (!isReflectionTrialUser(user._id.toHexString()) ||
            !CONFIG.REFLECTION_ENABLED ||
            !CONFIG.EMAIL_PROVIDER ||
            !CONFIG.EMAIL_UNSUBSCRIBE_SECRET ||
            !user.reflectionPreferences ||
            user.emailPreferences?.suppressedAt)
        )
          throw new Error(
            "Configure the approved trial account, email provider, unsubscribe secret, feature gate, and saved settings first",
          );
        if (values.apply) {
          await mongoService.user.updateOne(
            { _id: user._id },
            {
              $set: {
                "reflectionPreferences.enabled": action === "enable",
                ...(action === "enable"
                  ? { "reflectionPreferences.optedInAt": new Date() }
                  : { "emailPreferences.reflectionDisabledAt": new Date() }),
              },
              $unset: {
                reflectionNextSendAt: "",
                ...(action === "enable"
                  ? { "emailPreferences.reflectionDisabledAt": "" }
                  : {}),
              },
            },
          );
          if (action === "disable")
            await emailSendRepository.cancelQueuedReflection(user._id);
        }
        console.log(
          `${user._id.toHexString()}: ${action} ${values.apply ? "applied" : "dry run"}`,
        );
        continue;
      }
      const context = await reflectionCalendarContext(user);
      const metadata = await context.client.readReflection(context.principal, {
        calendarIds: context.calendarIds,
        selfEmails: context.selfEmails,
        windows: [],
      });
      if (!metadata.ok) throw new Error("Could not inspect calendar history");
      if (action === "status" || action === "history") {
        console.log(
          JSON.stringify({
            userId: user._id.toHexString(),
            enabled: user.reflectionPreferences?.enabled ?? false,
            calendarCount: context.calendarIds.length,
            ...metadata.value,
          }),
        );
        if (
          action === "history" &&
          values.apply &&
          !metadata.value.historyComplete
        ) {
          const imported = await context.client.importReflectionHistory(
            context.principal,
            context.calendarIds,
          );
          if (!imported.ok)
            throw new Error("Could not enqueue calendar history import");
          console.log(JSON.stringify(imported.value));
        }
        continue;
      }
      const timeZone = user.reflectionPreferences?.timeZone;
      if (!timeZone)
        throw new Error(
          "Set up the account timezone before generating a preview",
        );
      const date = z.iso
        .date()
        .parse(values.date ?? dayjs().tz(timeZone).format("YYYY-MM-DD"));
      if (values.weekly && dayjs(date).day() !== 0)
        throw new Error("Choose a Sunday date for --weekly");
      const token = buildUnsubscribeTokenForUser(user._id.toHexString());
      const unsubscribeUrl = token
        ? buildUnsubscribeUrls(token, "reflection").httpsUrl
        : new URL("/", CONFIG.FRONTEND_URL).toString();
      const now = new Date();
      const row = EmailSendRecordSchema.parse({
        _id: "reflection-preview",
        userId: user._id,
        sequence: "reflection",
        stepKey: "preview",
        status: "queued",
        sendAt: reflectionSendAt(date, timeZone),
        attemptCount: 0,
        nextAttemptAt: now,
        lastError: null,
        providerMessageId: null,
        sentAt: null,
        deliveredAt: null,
        createdAt: now,
        updatedAt: now,
        reflection: {
          date,
          timeZone,
          cadence: values.weekly ? "weekly" : "daily",
          trial: true,
        },
      });
      const rendered = await prepareReflection(row, user, unsubscribeUrl, {
        preview: true,
      });
      const output =
        values.output ?? (await mkdtemp(join(tmpdir(), "compass-reflection-")));
      await mkdir(output, { recursive: true });
      await writeFile(join(output, "reflection.html"), rendered.html);
      await writeFile(join(output, "reflection.txt"), rendered.text);
      if (rendered.pdfBase64)
        await writeFile(
          join(output, `compass-life-in-weeks-${date}.pdf`),
          Buffer.from(rendered.pdfBase64, "base64"),
        );
      console.log(`Unsent reflection preview: ${output}`);
    }
    if (!found) throw new Error("Account not found");
  } finally {
    await mongoService.stop();
  }
}
