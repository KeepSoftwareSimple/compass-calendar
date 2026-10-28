import { type gSchema$Event } from "@core/types/gcal";
import { redactedCause } from "@sync/safety/redact-error";

// Shared triage primitives for googleapis/gaxios failures. Quota/rate-limit
// reasons are retryable on writes and contact search; backend/internal faults
// are transient on reads but not treated as a write-side "slow down".

type GoogleErrorEntry = {
  domain?: string;
  reason?: string;
  message?: string;
  location?: string;
};

// The HTTP status of a googleapis/gaxios error, from the response or the error
// code. Reading it does not touch the request. Undefined means no HTTP
// response reached us (a network failure), which classifies as transient.
export function googleStatus(error: unknown): number | undefined {
  const status =
    (error as { response?: { status?: number } })?.response?.status ??
    (error as { code?: number })?.code;
  return typeof status === "number" ? status : undefined;
}

function googleErrorEntriesRaw(error: unknown): unknown[] {
  const fromBody = (
    error as {
      response?: {
        data?: { error?: { errors?: unknown[] } };
      };
    }
  )?.response?.data?.error?.errors;
  const fromError = (error as { errors?: unknown[] })?.errors;
  return [...(fromBody ?? []), ...(fromError ?? [])];
}

function googleErrorEntries(error: unknown): GoogleErrorEntry[] {
  const entries: GoogleErrorEntry[] = [];
  for (const raw of googleErrorEntriesRaw(error)) {
    const entry = raw as {
      domain?: unknown;
      reason?: unknown;
      message?: unknown;
      location?: unknown;
    };
    entries.push({
      domain: typeof entry.domain === "string" ? entry.domain : undefined,
      reason: typeof entry.reason === "string" ? entry.reason : undefined,
      message: typeof entry.message === "string" ? entry.message : undefined,
      location: typeof entry.location === "string" ? entry.location : undefined,
    });
  }
  return entries;
}

// Google's machine-readable reasons for a failed call (e.g. "notFound",
// "rateLimitExceeded"), from the standard error body; googleapis may put the
// errors array on the response body OR on the error object itself — check
// both. Response-derived only.
export function googleErrorReasons(error: unknown): string[] {
  return googleErrorEntries(error).flatMap((entry) =>
    entry.reason === undefined ? [] : [entry.reason],
  );
}

/** Top-level keys on a Google request body, for logs only (no values/PII). */
export function googleRequestBodyKeys(
  body: Record<string, unknown> | undefined,
): string[] {
  if (!body) return [];
  return Object.keys(body).sort();
}

export function formatGoogleErrorEntriesForLog(error: unknown): string {
  const entries = googleErrorEntries(error);
  if (entries.length === 0) return "(no errors[] entries)";
  return entries
    .map((entry) =>
      [
        entry.domain ? `domain=${entry.domain}` : null,
        entry.reason ? `reason=${entry.reason}` : null,
        entry.message ? `message=${entry.message}` : null,
        entry.location ? `location=${entry.location}` : null,
      ]
        .filter(Boolean)
        .join(" "),
    )
    .join("; ");
}

/** Field-presence summary for skipped Google events (no titles, attendees, etc.). */
export function summarizeGoogleEventFieldsForLog(item: gSchema$Event): string {
  const start = item.start;
  const end = item.end;
  return [
    `status=${item.status ?? "none"}`,
    `eventType=${item.eventType ?? "default"}`,
    `start.date=${start?.date ? "y" : "n"}`,
    `start.dateTime=${start?.dateTime ? "y" : "n"}`,
    `start.timeZone=${start?.timeZone ? "y" : "n"}`,
    `end.date=${end?.date ? "y" : "n"}`,
    `end.dateTime=${end?.dateTime ? "y" : "n"}`,
    `end.timeZone=${end?.timeZone ? "y" : "n"}`,
    `recurringEventId=${item.recurringEventId ? "y" : "n"}`,
  ].join(", ");
}

/**
 * Schedule/recurrence shape of a Google write body, for 400 logs only. Says
 * which start/end fields are set, how start compares to end, and which
 * recurrence line types were sent, never the times, zones, or rules.
 */
export function summarizeGoogleScheduleForLog(body: gSchema$Event): string {
  const { start, end, recurrence } = body;
  return [
    `start=${eventDateTimeKind(start)}`,
    `end=${eventDateTimeKind(end)}`,
    `start.timeZone=${start?.timeZone ? "y" : "n"}`,
    `end.timeZone=${end?.timeZone ? "y" : "n"}`,
    `sameTimeZone=${start?.timeZone === end?.timeZone ? "y" : "n"}`,
    `startVsEnd=${compareStartToEnd(start, end)}`,
    `recurrence=${recurrenceShape(recurrence)}`,
  ].join(", ");
}

type EventDateTime = NonNullable<gSchema$Event["start"]>;

function eventDateTimeKind(value: EventDateTime | undefined): string {
  if (value?.date && value.dateTime) return "both";
  if (value?.dateTime) return "timed";
  if (value?.date) return "allDay";
  return "none";
}

function compareStartToEnd(
  start: EventDateTime | undefined,
  end: EventDateTime | undefined,
): string {
  const startMs = Date.parse(start?.dateTime ?? start?.date ?? "");
  const endMs = Date.parse(end?.dateTime ?? end?.date ?? "");
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return "unparsed";
  if (startMs < endMs) return "before";
  if (startMs === endMs) return "equal";
  return "after";
}

// "series[RRULE,EXDATE]" for written rules, "cleared" for a null (convert to
// single), "omitted" for an instance write that leaves the key off.
function recurrenceShape(recurrence: gSchema$Event["recurrence"]): string {
  if (recurrence === undefined) return "omitted";
  if (recurrence === null) return "cleared";
  const lineTypes = recurrence.map((line) => line.split(/[:;]/, 1)[0]);
  return `series[${lineTypes.join(",")}]`;
}

// Quota/rate 403s mean "slow down", not "forbidden".
export const GOOGLE_RATE_LIMIT_REASONS = [
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "dailyLimitExceeded",
];

// Read-path transients also include Google's own backend/internal faults.
export const GOOGLE_TRANSIENT_REASONS = [
  ...GOOGLE_RATE_LIMIT_REASONS,
  "backendError",
  "internalError",
];

export function hasGoogleRateLimitReason(error: unknown): boolean {
  return googleErrorReasons(error).some((reason) =>
    GOOGLE_RATE_LIMIT_REASONS.includes(reason),
  );
}

// 429 / 5xx / no HTTP response, plus Google's 403-shaped rate-limit and quota
// reasons, are the only cases worth burning retries on. Everything else is a
// durable refusal.
export function isGoogleTransient(
  error: unknown,
  status: number | undefined = googleStatus(error),
): boolean {
  if (status === undefined || status === 429 || status >= 500) return true;
  return googleErrorReasons(error).some((reason) =>
    GOOGLE_TRANSIENT_REASONS.includes(reason),
  );
}

// Like redactedCause: drop request-derived fields (the gaxios config carries
// the bearer token), but keep the two response facts triage needs — numeric
// HTTP status and Google's machine-readable reason. Without them a durable
// failure is guesswork to diagnose from logs (2026-07-30 prod triage;
// 2026-08-07: 78 subscriptionMaintain exceptions with no status/reason).
export function googleFailureCause(error: unknown): Error | undefined {
  const status = googleStatus(error);
  const reason = googleErrorReasons(error)[0];
  const facts = [
    ...(status === undefined ? [] : [`HTTP ${status}`]),
    ...(reason === undefined ? [] : [`reason ${reason}`]),
  ];
  // Nothing response-derived to add (a bare network failure): fall back to
  // the plain redacted message.
  if (facts.length === 0) return redactedCause(error);
  const message = error instanceof Error ? error.message : null;
  return new Error(
    message ? `${message} (${facts.join(", ")})` : facts.join(", "),
  );
}
