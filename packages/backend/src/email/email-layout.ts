import { type WelcomeEmailContentEntry } from "@backend/email/welcome-sequence.content";

const UTM_PARAMS = "utm_source=email&utm_campaign=welcome";

function appendUtm(href: string, stepKey: string): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}${UTM_PARAMS}&utm_content=${encodeURIComponent(stepKey)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderWelcomeEmail(
  stepKey: string,
  content: WelcomeEmailContentEntry,
): { subject: string; html: string; text: string } {
  const ctaHref = appendUtm(content.cta.href, stepKey);
  const paragraphHtml = content.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">${escapeHtml(paragraph)}</p>`,
    )
    .join("");
  const paragraphText = content.paragraphs.join("\n\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(content.subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#6b7280;">${escapeHtml(content.preheader)}</p>
      <h1 style="margin:0 0 20px;font-size:24px;line-height:32px;color:#111827;">${escapeHtml(content.heading)}</h1>
      ${paragraphHtml}
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:16px;line-height:24px;padding:12px 20px;border-radius:6px;">${escapeHtml(content.cta.label)}</a>
      </p>
    </div>
  </body>
</html>`;

  const text = `${content.heading}

${paragraphText}

${content.cta.label}: ${ctaHref}`;

  return {
    subject: content.subject,
    html,
    text,
  };
}

export function extractLinksFromRenderedEmail(
  html: string,
  text: string,
): string[] {
  const hrefMatches = [...html.matchAll(/href="([^"]+)"/g)].map(
    (match) => match[1] ?? "",
  );
  const textUrlMatches = [...text.matchAll(/https?:\/\/[^\s]+/g)].map(
    (match) => match[0] ?? "",
  );
  return [...hrefMatches, ...textUrlMatches];
}
