import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import { type TransformableInfo } from "logform";
import TransportStream from "winston-transport";
import {
  isBookingUnsafeMetaKey,
  redactBookingSecretsFromString,
  sanitizeBookingTelemetry,
} from "@core/booking/booking-telemetry";
import {
  describeErrorChain,
  formatErrorChain,
  isUnsafeMetaKey,
  rootCauseMessage,
} from "@core/logger/log-serialization";

const otelLogger = logs.getLogger("compass");

const severityNumbers: Record<string, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
  verbose: SeverityNumber.DEBUG,
  http: SeverityNumber.INFO,
  silly: SeverityNumber.TRACE,
};

export type OtelAttributes = Record<
  string,
  string | number | boolean | undefined
>;

// Pure, so the leak-prevention behavior (never emit a raw non-Error cause,
// never emit any other Error's enumerable own properties) is directly
// testable without an OTel logger provider wired up.
export function buildOtelAttributes(
  info: Record<string, unknown>,
): OtelAttributes {
  return Object.entries(info)
    .filter(
      ([key]) =>
        key !== "level" &&
        key !== "message" &&
        !key.startsWith("[") &&
        typeof key !== "symbol" &&
        !isUnsafeMetaKey(key) &&
        !isBookingUnsafeMetaKey(key),
    )
    .reduce<OtelAttributes>((acc, [key, value]) => {
      if (key === "cause") {
        // A non-Error cause could be any shape — including an unvetted
        // object carrying the same secrets describeErrorChain guards
        // against — so it is dropped rather than stringified.
        if (value instanceof Error) {
          const chain = describeErrorChain(value);
          acc[key] = redactBookingSecretsFromString(formatErrorChain(chain));
          const rootCause = rootCauseMessage(chain);
          if (rootCause !== undefined) {
            acc["root_cause"] = redactBookingSecretsFromString(rootCause);
          }
        }
        return acc;
      }
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        acc[key] =
          typeof value === "string"
            ? redactBookingSecretsFromString(value)
            : value;
      } else if (value instanceof Error) {
        acc[key] = redactBookingSecretsFromString(
          formatErrorChain(describeErrorChain(value)),
        );
      } else if (value != null) {
        acc[key] = JSON.stringify(
          sanitizeBookingTelemetry(value, { dropUnsafeKeys: true }),
        );
      }
      return acc;
    }, {});
}

export class OpenTelemetryTransport extends TransportStream {
  log(info: TransformableInfo, next: () => void): void {
    otelLogger.emit({
      severityText: info.level,
      severityNumber: severityNumbers[info.level] ?? SeverityNumber.INFO,
      body: String(info.message),
      attributes: buildOtelAttributes(info),
    });

    next();
  }
}
