import { type CalendarConference } from "@core/types/calendar.contracts";
import { escapeHtml } from "@core/util/escape-html.util";
import { type BookingReservationRecord } from "@backend/booking/booking-reservation.record";
import {
  formatBookingEmailSlotRange,
  formatBookingEmailWhen,
} from "@backend/email/booking-host-email.format";
import { type BookingHostEmailKind } from "@backend/email/booking-host-email.id";
import { type WelcomeEmailUnsubscribe } from "@backend/email/email-layout";

export type BookingHostEmailContentInput = {
  kind: BookingHostEmailKind;
  guestName: string;
  guestEmail: string;
  notes: string | null;
  durationMinutes: number;
  pageTimeZone: string;
  guestTimeZone: string;
  slotStart: Date;
  slotEnd: Date;
  previousSlotStart?: Date;
  conference: CalendarConference;
  openInCompassUrl: string;
  unsubscribe?: WelcomeEmailUnsubscribe;
};

function conferenceLine(conference: CalendarConference): string | null {
  if (conference === "meet") {
    return "Video: Google Meet (see the calendar event for the link)";
  }
  if (conference === "teams") {
    return "Video: Microsoft Teams (see the calendar event for the link)";
  }
  return null;
}

function buildSubject(input: BookingHostEmailContentInput): string {
  const guestTimeWhen = formatBookingEmailWhen(
    input.slotStart,
    input.guestTimeZone,
  );
  switch (input.kind) {
    case "cancelled":
      return `${input.guestName} cancelled your meeting`;
    case "rescheduled":
      return `${input.guestName} moved a meeting to ${guestTimeWhen}`;
    default:
      return `${input.guestName} booked a ${input.durationMinutes}-minute meeting`;
  }
}

function buildHeading(input: BookingHostEmailContentInput): string {
  switch (input.kind) {
    case "cancelled":
      return `${input.guestName} cancelled a meeting`;
    case "rescheduled":
      return `${input.guestName} moved a meeting`;
    default:
      return `${input.guestName} booked a meeting`;
  }
}

function buildBodyParagraphs(input: BookingHostEmailContentInput): string[] {
  const guestWhen = formatBookingEmailSlotRange(
    input.slotStart,
    input.slotEnd,
    input.guestTimeZone,
  );
  const hostWhen =
    input.pageTimeZone === input.guestTimeZone
      ? null
      : formatBookingEmailSlotRange(
          input.slotStart,
          input.slotEnd,
          input.pageTimeZone,
        );

  const lines: string[] = [];
  if (input.kind === "rescheduled" && input.previousSlotStart) {
    lines.push(
      `Previous time (guest): ${formatBookingEmailWhen(input.previousSlotStart, input.guestTimeZone)}`,
    );
    if (hostWhen) {
      lines.push(
        `Previous time (your calendar): ${formatBookingEmailWhen(input.previousSlotStart, input.pageTimeZone)}`,
      );
    }
  }

  lines.push(`When (guest time): ${guestWhen}`);
  if (hostWhen) {
    lines.push(`When (your calendar): ${hostWhen}`);
  }

  lines.push(`Guest: ${input.guestName} (${input.guestEmail})`);

  const video = conferenceLine(input.conference);
  if (video) {
    lines.push(video);
  }

  if (input.notes?.trim()) {
    lines.push(`Notes: ${input.notes.trim()}`);
  }

  return lines;
}

export function renderBookingHostEmail(input: BookingHostEmailContentInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = buildSubject(input);
  const heading = buildHeading(input);
  const paragraphs = buildBodyParagraphs(input);

  const paragraphHtml = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#1f2937;">${escapeHtml(paragraph)}</p>`,
    )
    .join("");
  const paragraphText = paragraphs.join("\n\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:24px;background:#f9fafb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <h1 style="margin:0 0 20px;font-size:24px;line-height:32px;color:#111827;">${escapeHtml(heading)}</h1>
      ${paragraphHtml}
      <p style="margin:24px 0 0;">
        <a href="${escapeHtml(input.openInCompassUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:16px;line-height:24px;padding:12px 20px;border-radius:6px;">Open in Compass</a>
      </p>
      ${
        input.unsubscribe
          ? `<p style="margin:32px 0 0;font-size:13px;line-height:20px;color:#6b7280;">
        <a href="${escapeHtml(input.unsubscribe.httpsUrl)}" style="color:#6b7280;">Turn off booking alert emails</a>
      </p>`
          : ""
      }
    </div>
  </body>
</html>`;

  const text = `${heading}

${paragraphText}

Open in Compass: ${input.openInCompassUrl}${
    input.unsubscribe
      ? `\n\nTurn off booking alert emails: ${input.unsubscribe.httpsUrl}`
      : ""
  }`;

  return { subject, html, text };
}

export function durationMinutesForHostEmail(
  reservation: BookingReservationRecord,
  pageDurationMinutes: number,
): number {
  const computed = Math.round(
    (reservation.slotEnd.getTime() - reservation.slotStart.getTime()) / 60_000,
  );
  return computed > 0 ? computed : pageDurationMinutes;
}
