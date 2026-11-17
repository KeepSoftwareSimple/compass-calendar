import { type Request, type Response } from "express";
import { z } from "zod/v4";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { emailListIncludes } from "@core/util/email.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import { buildEmailProvider } from "@backend/email/providers/email.client";
import { type EmailProvider } from "@backend/email/providers/email.port";
import { renderDesktopReminderEmail } from "@backend/landing/desktop-reminder.email";
import { addKitSubscriber } from "@backend/landing/kit.client";
import { createHash } from "node:crypto";

const logger = Logger("app:landing.desktop-reminder");

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
});

let provider: EmailProvider | undefined;

// One reminder per address per UTC day, however often the form is submitted.
const idempotencyKey = (email: string): string => {
  const day = new Date().toISOString().slice(0, 10);
  const digest = createHash("sha256").update(`${email}:${day}`).digest("hex");
  return `desktop-reminder-${digest.slice(0, 32)}`;
};

/**
 * A phone visitor on the landing page asks for the link by email: add them to
 * the Kit subscriber list, then send the reminder. Both must succeed, so the
 * page never says "sent" for an email that is not coming.
 */
export async function requestDesktopReminder(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(Status.BAD_REQUEST).json({ error: "invalid_email" });
    return;
  }
  if (!CONFIG.KIT_API_KEY) {
    res.status(Status.SERVICE_UNAVAILABLE).json({ error: "not_configured" });
    return;
  }

  const { email } = parsed.data;
  try {
    await addKitSubscriber(email, CONFIG.KIT_API_KEY);

    const allowlist = CONFIG.EMAIL_ALLOWLIST;
    if (allowlist.length === 0 || emailListIncludes(allowlist, email)) {
      provider ??= buildEmailProvider(CONFIG);
      await provider.send({
        idempotencyKey: idempotencyKey(email),
        to: email,
        headers: {},
        ...renderDesktopReminderEmail(CONFIG.FRONTEND_URL),
      });
    }
  } catch (error) {
    logger.error("Desktop reminder failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    res.status(Status.BAD_GATEWAY).json({ error: "send_failed" });
    return;
  }

  res.status(Status.OK).json({ ok: true });
}
