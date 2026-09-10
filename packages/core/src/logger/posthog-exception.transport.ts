import { type TransformableInfo } from "logform";
import TransportStream from "winston-transport";
import { POSTHOG_ERROR_TRACKING_PROPERTY } from "@core/constants/posthog-error-tracking.properties";
import {
  type DescribedError,
  describeErrorChain,
  isUnsafeMetaKey,
  rootCauseMessage,
} from "@core/logger/log-serialization";
import { getPostHogClient, getPostHogContext } from "./otel-logs";

export type PostHogProperties = Record<string | number, unknown>;

// Pure, so the leak-prevention behavior (never forward a raw Error's
// enumerable own properties, never forward a non-Error cause) is directly
// testable without a PostHog client configured.
export function buildPostHogProperties(
  info: Record<string, unknown>,
): PostHogProperties {
  const properties: PostHogProperties = {};

  for (const [key, value] of Object.entries(info)) {
    if (
      key === "level" ||
      key === "message" ||
      key === "stack" ||
      key === "userId" ||
      typeof key === "symbol" ||
      key.startsWith("[") ||
      isUnsafeMetaKey(key)
    ) {
      continue;
    }

    if (key === "cause") {
      // A non-Error cause could be any shape — including an unvetted object
      // carrying the same secrets describeErrorChain guards against — so it
      // is dropped rather than forwarded raw.
      if (value instanceof Error) {
        const chain = describeErrorChain(value);
        properties["cause_chain"] = chain;
        const rootCause = rootCauseMessage(chain);
        if (rootCause !== undefined) properties["root_cause"] = rootCause;
      }
      continue;
    }

    if (value instanceof Error) {
      // Any other Error-valued field: forward only the allowlisted chain,
      // never the raw Error (whose enumerable own properties, for a gaxios
      // error, include the request config and its bearer token).
      properties[key] = describeErrorChain(value) satisfies DescribedError[];
      continue;
    }

    properties[key] = value;
  }

  return properties;
}

export class PostHogExceptionTransport extends TransportStream {
  constructor() {
    super({ level: "error" });
  }

  log(info: TransformableInfo, next: () => void): void {
    const posthog = getPostHogClient();
    if (!posthog) {
      next();
      return;
    }

    const message = String(info.message || "Error");
    const stack = info["stack"] ? String(info["stack"]) : undefined;
    const userId = info["userId"] ? String(info["userId"]) : undefined;
    const errorType = info[POSTHOG_ERROR_TRACKING_PROPERTY.errorType]
      ? String(info[POSTHOG_ERROR_TRACKING_PROPERTY.errorType])
      : undefined;
    const result = info[POSTHOG_ERROR_TRACKING_PROPERTY.result]
      ? String(info[POSTHOG_ERROR_TRACKING_PROPERTY.result])
      : undefined;

    // Bare `new Error(message)` groups every call site sharing a generic
    // ErrorMetadata description (e.g. "Not sure why error occurred. See
    // logs") into one PostHog issue titled "Error". Naming the error after
    // the specific BaseError code/result restores per-call-site grouping.
    const err = new Error(result ? `${result}: ${message}` : message);
    if (errorType) {
      err.name = errorType;
    }
    if (stack) {
      err.stack = stack;
    }

    const distinctId = userId || "unknown";
    const properties = buildPostHogProperties(info);

    const context = getPostHogContext();
    if (context) {
      properties[POSTHOG_ERROR_TRACKING_PROPERTY.environment] =
        context.environment;
      properties[POSTHOG_ERROR_TRACKING_PROPERTY.service] = context.service;
      if (context.version) {
        properties[POSTHOG_ERROR_TRACKING_PROPERTY.version] = context.version;
      }
    }

    posthog.captureException(err, distinctId, properties);

    next();
  }
}
