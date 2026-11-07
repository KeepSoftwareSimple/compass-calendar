import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import mongoService from "@backend/common/services/mongo.service";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  type EmailUnsubscribeScope,
  parseUnsubscribeUserId,
} from "@backend/email/email-unsubscribe";
import {
  markBookingHostEmailDisabled,
  markUserUnsubscribed,
  resolveUserIdFromUnsubscribeToken,
} from "@backend/email/services/email-suppression.service";

const parseScope = (value: unknown): EmailUnsubscribeScope => {
  return value === "booking-host" || value === "reflection" ? value : "welcome";
};

const pageShell = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      ${body}
    </div>
  </body>
</html>`;

const invalidPage = (): string =>
  pageShell(
    "Unsubscribe",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">This link is no longer valid</h1>
     <p style="margin:0;font-size:16px;line-height:24px;color:#4b5563;">The unsubscribe link may have expired or already been used.</p>`,
  );

const confirmPage = (token: string, scope: EmailUnsubscribeScope): string => {
  if (scope === "reflection")
    return pageShell(
      "Weekly reflections",
      `<h1>Stop weekly reflections</h1><p>You will stop receiving calendar reflection emails from Compass.</p><form method="post" action="/api/email/unsubscribe"><input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" /><input type="hidden" name="scope" value="reflection" /><button type="submit">Stop reflections</button></form>`,
    );
  const isBookingHost = scope === "booking-host";
  const description = isBookingHost
    ? "You will stop receiving email when guests book, cancel, or reschedule meetings on your Compass meeting page."
    : "You will stop receiving welcome sequence messages from Compass Calendar.";
  const scopeField =
    scope === "booking-host"
      ? `<input type="hidden" name="scope" value="booking-host" />`
      : "";
  return pageShell(
    "Unsubscribe",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">${isBookingHost ? "Turn off booking alert emails" : "Unsubscribe from Compass emails"}</h1>
     <p style="margin:0 0 20px;font-size:16px;line-height:24px;color:#4b5563;">${description}</p>
     <form method="post" action="/api/email/unsubscribe">
       <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" />
       ${scopeField}
       <button type="submit" style="background:#2563eb;color:#ffffff;border:none;border-radius:6px;padding:12px 20px;font-size:16px;cursor:pointer;">Confirm</button>
     </form>`,
  );
};

const donePage = (scope: EmailUnsubscribeScope): string => {
  if (scope === "reflection")
    return pageShell(
      "Reflections are off",
      "<h1>Reflections are off</h1><p>You will not receive further calendar reflection emails.</p>",
    );
  const description =
    scope === "booking-host"
      ? "You will not receive further booking alert emails from Compass Calendar."
      : "You will not receive further welcome sequence emails from Compass Calendar.";
  return pageShell(
    "Unsubscribed",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">${scope === "booking-host" ? "Booking alerts are off" : "You are unsubscribed"}</h1>
     <p style="margin:0;font-size:16px;line-height:24px;color:#4b5563;">${description}</p>`,
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
            "reflectionPreferences.enabled": false,
          },
        },
      );
      await emailSendRepository.cancelQueuedReflection(userId);
    } else if (scope === "booking-host") {
      await markBookingHostEmailDisabled(userId);
    } else {
      await markUserUnsubscribed(userId);
    }
    res.status(Status.OK).type("html").send(donePage(scope));
  };
}

export default new EmailUnsubscribeController();
