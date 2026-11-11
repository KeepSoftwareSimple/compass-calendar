import { type WithId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import dayjs from "@core/util/date/dayjs";
import { escapeHtml } from "@core/util/escape-html.util";
import {
  renderWelcomeEmail,
  type WelcomeEmailUnsubscribe,
} from "@backend/email/email-layout";
import { type EmailSendRecord } from "@backend/email/email-send.record";
import { prepareReflection } from "@backend/email/reflection-context";
import {
  isReflectionTrialUser,
  reflectionEligible,
} from "@backend/email/reflection-enrollment";
import { WELCOME_SEQUENCE_CONTENT } from "@backend/email/welcome-sequence.content";

export async function prepareWelcomeReviewEmail(
  row: EmailSendRecord,
  user: WithId<Schema_User>,
  unsubscribe: WelcomeEmailUnsubscribe,
) {
  const intro = WELCOME_SEQUENCE_CONTENT["weekly-review"];
  // Feature rollout gates and explicit pauses still apply to onboarding.
  if (
    !reflectionEligible(user, isReflectionTrialUser(user._id.toHexString()))
  ) {
    return {
      ...renderWelcomeEmail("weekly-review", intro, unsubscribe),
      pdfBase64: null,
      memoryIds: [],
      calendarIds: [],
      lifeRevision: user.lifePreferences?.revision ?? 0,
    };
  }
  const timeZone = user.reflectionPreferences!.timeZone;
  const date =
    row.reflection?.date ?? dayjs().tz(timeZone).format("YYYY-MM-DD");
  const review = await prepareReflection(
    { ...row, reflection: { date, timeZone, cadence: "daily", trial: false } },
    user,
    unsubscribe.httpsUrl,
    { preview: true, allowIncompleteHistory: true },
  );
  const introduction = renderWelcomeEmail("weekly-review", intro);
  const introHtml = `<p><strong>${escapeHtml(intro.heading)}</strong></p>${intro.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<p><a href="${escapeHtml(intro.cta.href)}">${escapeHtml(intro.cta.label)}</a></p>`;
  return {
    ...review,
    subject: intro.subject,
    html: review.html.replace("<body>", `<body>${introHtml}`),
    text: `${introduction.text}\n\n${review.text}`,
  };
}
