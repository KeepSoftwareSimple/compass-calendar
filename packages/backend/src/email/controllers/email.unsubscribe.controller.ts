import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import mongoService from "@backend/common/services/mongo.service";
import { emailAnalytics } from "@backend/email/email.analytics";
import { pageShell } from "@backend/email/email-page";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  buildReflectionEnableUrl,
  type EmailUnsubscribeScope,
  parseUnsubscribeUserId,
} from "@backend/email/email-unsubscribe";
import { EMAIL_REPLY_TO } from "@backend/email/providers/email.client";
import {
  markBookingHostEmailDisabled,
  markUserUnsubscribed,
  resolveUserIdFromUnsubscribeToken,
} from "@backend/email/services/email-suppression.service";

const parseScope = (value: unknown): EmailUnsubscribeScope => {
  return value === "booking-host" || value === "reflection" ? value : "welcome";
};

const invalidPage = (): string =>
  pageShell(
    "Unsubscribe",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">This link is no longer valid</h1>
     <p style="margin:0;font-size:16px;line-height:24px;color:#4b5563;">The unsubscribe link may have expired or already been used.</p>`,
  );

const confirmPage = (token: string, scope: EmailUnsubscribeScope): string => {
  const isBookingHost = scope === "booking-host";
  const isReflection = scope === "reflection";
  const description = isBookingHost
    ? "You will stop receiving email when guests book, cancel, or reschedule meetings on your Compass meeting page."
    : isReflection
      ? "You will stop receiving weekly reflection emails. Your calendar and other emails are not affected."
      : "You will stop receiving welcome sequence messages from Compass Calendar.";
  const scopeField =
    scope === "welcome"
      ? ""
      : `<input type="hidden" name="scope" value="${scope}" />`;
  return pageShell(
    "Unsubscribe",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">${isBookingHost ? "Turn off booking alert emails" : isReflection ? "Turn off weekly reflections" : "Unsubscribe from Compass emails"}</h1>
     <p style="margin:0 0 20px;font-size:16px;line-height:24px;color:#4b5563;">${description}</p>
     <form method="post" action="/api/email/unsubscribe">
       <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" />
       ${scopeField}
       <button type="submit" style="background:#2563eb;color:#ffffff;border:none;border-radius:6px;padding:12px 20px;font-size:16px;cursor:pointer;">Confirm</button>
     </form>`,
  );
};

const feedbackLink = `<p><a href="mailto:${EMAIL_REPLY_TO}?subject=Compass%20email%20feedback">Share feedback by email (optional)</a></p>`;

const donePage = (scope: EmailUnsubscribeScope, token: string): string => {
  if (scope === "reflection")
    return pageShell(
      "Reflections are off",
      `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">Weekly reflections are off</h1>
     <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#4b5563;">You will not receive further weekly reflection emails.</p>
     <p><a href="${buildReflectionEnableUrl(token).replace(/"/g, "&quot;")}">Changed your mind? Turn them back on</a></p>${feedbackLink}`,
    );
  const description =
    scope === "booking-host"
      ? "You will not receive further booking alert emails from Compass Calendar."
      : "You will not receive further welcome sequence emails from Compass Calendar.";
  return pageShell(
    "Unsubscribed",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">${scope === "booking-host" ? "Booking alerts are off" : "You are unsubscribed"}</h1>
     <p style="margin:0;font-size:16px;line-height:24px;color:#4b5563;">${description}</p>${feedbackLink}`,
  );
};

export class EmailUnsubscribeController {
  showConfirmation = async (req: Request, res: Response): Promise<void> => {
    const token =
      typeof req.query["token"] === "string" ? req.query["token"] : "";
    if (!token || !parseUnsubscribeUserId(token)) {
      res.status(Status.OK).type("html").send(invalidPage());
      return;
    }
    const scope = parseScope(req.query["scope"]);
    res.status(Status.OK).type("html").send(confirmPage(token, scope));
  };

  confirmUnsubscribe = async (req: Request, res: Response): Promise<void> => {
    const token =
      typeof req.body?.token === "string"
        ? req.body.token
        : typeof req.query["token"] === "string"
          ? req.query["token"]
          : "";
    const scope = parseScope(
      req.body?.scope ?? (req.query ? req.query["scope"] : undefined),
    );
    const userId = await resolveUserIdFromUnsubscribeToken(token);
    if (!userId) {
      res.status(Status.OK).type("html").send(invalidPage());
      return;
    }

    const user = await mongoService.user.findOne({ _id: userId });
    if (!user) {
      res.status(Status.OK).type("html").send(invalidPage());
      return;
    }

    if (scope === "reflection") {
      await mongoService.user.updateOne(
        { _id: userId },
        {
          $set: {
            "emailPreferences.reflectionDisabledAt": new Date(),
            ...(user.reflectionPreferences
              ? { "reflectionPreferences.enabled": false }
              : {}),
          },
        },
      );
      await emailSendRepository.cancelQueuedReflection(userId, true);
      if (user.reflectionPreferences?.enabled)
        void emailAnalytics.capture({
          event: "email_unsubscribed",
          userId: userId.toHexString(),
          properties: { sequence: "reflection", source: "email" },
        });
    } else if (scope === "booking-host") {
      await markBookingHostEmailDisabled(userId);
    } else {
      await markUserUnsubscribed(userId);
    }
    res.status(Status.OK).type("html").send(donePage(scope, token));
  };
}

export default new EmailUnsubscribeController();
