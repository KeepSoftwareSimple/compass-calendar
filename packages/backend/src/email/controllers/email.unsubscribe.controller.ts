import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import mongoService from "@backend/common/services/mongo.service";
import { parseUnsubscribeUserId } from "@backend/email/email-unsubscribe";
import {
  markUserUnsubscribed,
  resolveUserIdFromUnsubscribeToken,
} from "@backend/email/services/email-suppression.service";

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

const confirmPage = (token: string): string =>
  pageShell(
    "Unsubscribe",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">Unsubscribe from Compass emails</h1>
     <p style="margin:0 0 20px;font-size:16px;line-height:24px;color:#4b5563;">You will stop receiving welcome sequence messages from Compass Calendar.</p>
     <form method="post" action="/api/email/unsubscribe">
       <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" />
       <button type="submit" style="background:#2563eb;color:#ffffff;border:none;border-radius:6px;padding:12px 20px;font-size:16px;cursor:pointer;">Confirm unsubscribe</button>
     </form>`,
  );

const donePage = (): string =>
  pageShell(
    "Unsubscribed",
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">You are unsubscribed</h1>
     <p style="margin:0;font-size:16px;line-height:24px;color:#4b5563;">You will not receive further welcome sequence emails from Compass Calendar.</p>`,
  );

export class EmailUnsubscribeController {
  showConfirmation = async (req: Request, res: Response): Promise<void> => {
    const token =
      typeof req.query["token"] === "string" ? req.query["token"] : "";
    if (!token || !parseUnsubscribeUserId(token)) {
      res.status(Status.OK).type("html").send(invalidPage());
      return;
    }
    res.status(Status.OK).type("html").send(confirmPage(token));
  };

  confirmUnsubscribe = async (req: Request, res: Response): Promise<void> => {
    const token =
      typeof req.body?.token === "string"
        ? req.body.token
        : typeof req.query["token"] === "string"
          ? req.query["token"]
          : "";
    const userId = await resolveUserIdFromUnsubscribeToken(
      token,
      parseUnsubscribeUserId,
    );
    if (!userId) {
      res.status(Status.OK).type("html").send(invalidPage());
      return;
    }

    const user = await mongoService.user.findOne({ _id: userId });
    if (!user) {
      res.status(Status.OK).type("html").send(invalidPage());
      return;
    }

    await markUserUnsubscribed(userId);
    res.status(Status.OK).type("html").send(donePage());
  };
}

export default new EmailUnsubscribeController();
