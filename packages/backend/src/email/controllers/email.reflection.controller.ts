import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { ReflectionPreferencesSchema } from "@core/types/life-preferences.contracts";
import mongoService from "@backend/common/services/mongo.service";
import { pageShell } from "@backend/email/email-page";
import { parseUnsubscribeUserId } from "@backend/email/email-unsubscribe";
import {
  reflectionEnableBlock,
  setReflectionEnabled,
} from "@backend/email/reflection-opt-in";
import { resolveUserIdFromUnsubscribeToken } from "@backend/email/services/email-suppression.service";

const heading = (text: string) =>
  `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:#111827;">${text}</h1>`;
const paragraph = (text: string) =>
  `<p style="margin:0 0 20px;font-size:16px;line-height:24px;color:#4b5563;">${text}</p>`;

const invalidPage = () =>
  pageShell(
    "Weekly reflections",
    `${heading("This link is no longer valid")}${paragraph("The link may have expired. You can turn on weekly reflections in Settings, under Notifications.")}`,
  );

const messagePage = (title: string, message: string) =>
  pageShell("Weekly reflections", `${heading(title)}${paragraph(message)}`);

const confirmPage = (token: string) =>
  pageShell(
    "Turn on weekly reflections",
    `${heading("Turn on weekly reflections")}
     ${paragraph("Every Sunday at 10:30 a.m. you will get a short email with highlights from your week, memories from past years, and a look ahead. You can turn it off any time.")}
     <form method="post" action="/api/email/reflection">
       <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}" />
       <input type="hidden" name="timeZone" id="timeZone" value="UTC" />
       <button type="submit" style="background:#2563eb;color:#ffffff;border:none;border-radius:6px;padding:12px 20px;font-size:16px;cursor:pointer;">Turn on</button>
     </form>
     <script>try{document.getElementById("timeZone").value=Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"}catch(e){}</script>`,
  );

/** Token-authenticated opt-in, so an email button works on a phone, signed out. */
export class EmailReflectionController {
  showConfirmation = async (req: Request, res: Response): Promise<void> => {
    const token =
      typeof req.query["token"] === "string" ? req.query["token"] : "";
    const page =
      token && parseUnsubscribeUserId(token)
        ? confirmPage(token)
        : invalidPage();
    res.status(Status.OK).type("html").send(page);
  };

  confirmEnable = async (req: Request, res: Response): Promise<void> => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    const userId = await resolveUserIdFromUnsubscribeToken(token);
    const user = userId
      ? await mongoService.user.findOne({ _id: userId })
      : null;
    if (!user) {
      res.status(Status.OK).type("html").send(invalidPage());
      return;
    }
    const blocked = reflectionEnableBlock(user);
    if (blocked) {
      res
        .status(Status.OK)
        .type("html")
        .send(messagePage("Reflections are not available", blocked));
      return;
    }
    const saved = user.reflectionPreferences;
    const input = ReflectionPreferencesSchema.safeParse({
      enabled: true,
      timeZone: saved?.timeZone ?? req.body?.timeZone,
      excludedCalendarIds: saved?.excludedCalendarIds ?? [],
    });
    if (!input.success) {
      res
        .status(Status.OK)
        .type("html")
        .send(
          messagePage(
            "Something went wrong",
            "Open Compass and turn on weekly reflections in Settings, under Notifications.",
          ),
        );
      return;
    }
    await setReflectionEnabled(user, input.data, "email");
    res
      .status(Status.OK)
      .type("html")
      .send(
        messagePage(
          "Weekly reflections are on",
          "Reflections go out on Sundays once your calendar history and connections are ready. You can change this in Settings, under Notifications.",
        ),
      );
  };
}

export default new EmailReflectionController();
