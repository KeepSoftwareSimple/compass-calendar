import { redactBookingSecretsFromString } from "@core/booking/booking-telemetry";
import { createHash } from "node:crypto";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const MONGO_ID_RE = /\b[0-9a-f]{24}\b/gi;
const ISO_TIMESTAMP_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
const ATTEMPT_RE = /\battempt\s+\d+\b/gi;
const LONG_INT_RE = /\b\d{4,}\b/g;

export function normalizeExceptionMessage(message: string): string {
  const normalized = message
    .replace(UUID_RE, "<uuid>")
    .replace(MONGO_ID_RE, "<id>")
    .replace(ISO_TIMESTAMP_RE, "<timestamp>")
    .replace(ATTEMPT_RE, "attempt <n>")
    .replace(LONG_INT_RE, "<n>");
  return redactBookingSecretsFromString(normalized);
}

export function exceptionFingerprint(name: string, message: string): string {
  const normalized = normalizeExceptionMessage(message);
  return createHash("sha256").update(`${name}:${normalized}`).digest("hex");
}
