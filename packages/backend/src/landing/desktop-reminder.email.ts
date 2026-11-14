import { escapeHtml } from "@core/util/escape-html.util";

const SUBJECT = "Your link to Compass Calendar";
const HEADING = "Open Compass on your computer";
const PARAGRAPHS = [
  "You asked for this link while you were on your phone. Compass is a calendar you run from your keyboard, so it is designed for a laptop or desktop.",
  "Open the link on your computer and press C to create your first event. No signup required.",
];
const CTA_LABEL = "Open Compass";

/** The one email a phone visitor asks for from the landing page. */
export function renderDesktopReminderEmail(frontendUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const href = `${frontendUrl.replace(/\/+$/, "")}/week?utm_source=email&utm_campaign=desktop-reminder`;
  const paragraphHtml = PARAGRAPHS.map(
    (paragraph) =>
      `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">${escapeHtml(paragraph)}</p>`,
  ).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(SUBJECT)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 20px;font-size:24px;line-height:32px;color:#111827;">${escapeHtml(HEADING)}</h1>
      ${paragraphHtml}
      <p style="margin:0;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;padding:12px 20px;font-size:16px;">${escapeHtml(CTA_LABEL)}</a></p>
    </div>
  </body>
</html>`;

  const text = `${HEADING}\n\n${PARAGRAPHS.join("\n\n")}\n\n${CTA_LABEL}: ${href}\n`;

  return { subject: SUBJECT, html, text };
}
