import { type CaptureResult } from "posthog-js";
import { isTransientBrowserNetworkMessage } from "@web/api/util/backend-unavailable-error.util";

/**
 * posthog-js does not hand `before_send` the raw rejection value: when a
 * promise rejects with a non-Error (or a primitive), the SDK stringifies it
 * behind one of these prefixes. Every message comparison below has to run on
 * the unwrapped value, or an anchored pattern silently never matches in
 * production while passing against a hand-written bare string in a test.
 */
const SDK_WRAPPER_PREFIXES = [
  "Non-Error promise rejection captured with value: ",
  "Primitive value captured as exception: ",
];

const unwrapSdkMessage = (value: string): string => {
  const prefix = SDK_WRAPPER_PREFIXES.find((candidate) =>
    value.startsWith(candidate),
  );
  return prefix ? value.slice(prefix.length) : value;
};

/**
 * Unhandledrejection signature emitted by CefSharp / embedded WebView
 * automation scanners. No app frames, not actionable. The numeric id varies
 * per scan (seen Id:1, Id:2, ...), so match the shape rather than one value.
 * Anchored against the unwrapped message - see `unwrapSdkMessage`.
 */
const CEFSHARP_SCANNER_MESSAGE_PATTERN =
  /^Object Not Found Matching Id:\d+, MethodName:update, ParamCount:4$/;

/**
 * Browser-sanitized cross-origin `window.onerror` message. Same-origin app
 * scripts (this app's `/index.js` module) report real messages + frames;
 * "Script error." with no stack is almost always an extension, in-app browser,
 * or other third-party script — never actionable from our code alone.
 */
const SCRIPT_ERROR_MESSAGE = "Script error.";

/**
 * Benign browser warning fired via `window.onerror` when a ResizeObserver
 * callback can't finish notifying within one frame (e.g. it triggers layout
 * that would require another cycle). Chrome/Firefox surface it as a script
 * error even though nothing threw; it's not actionable on its own.
 */
const RESIZE_OBSERVER_LOOP_MESSAGES = new Set([
  "ResizeObserver loop completed with undelivered notifications.",
  "ResizeObserver loop limit exceeded",
]);

type ExceptionEntry = {
  type?: unknown;
  value?: unknown;
  stacktrace?: {
    frames?: unknown[];
  };
};

const readExceptionEntries = (
  properties: CaptureResult["properties"] | undefined,
): ExceptionEntry[] => {
  if (!properties) return [];

  const list = properties.$exception_list;
  if (Array.isArray(list) && list.length > 0) {
    return list as ExceptionEntry[];
  }

  const types = properties.$exception_types;
  const values = properties.$exception_values;
  if (!Array.isArray(types) && !Array.isArray(values)) {
    return [];
  }

  const length = Math.max(
    Array.isArray(types) ? types.length : 0,
    Array.isArray(values) ? values.length : 0,
  );

  return Array.from({ length }, (_, index) => ({
    type: Array.isArray(types) ? types[index] : undefined,
    value: Array.isArray(values) ? values[index] : undefined,
  }));
};

const hasStackFrames = (entry: ExceptionEntry): boolean => {
  const frames = entry.stacktrace?.frames;
  return Array.isArray(frames) && frames.length > 0;
};

const isDroppableException = (entry: ExceptionEntry): boolean => {
  if (typeof entry.value !== "string") return false;

  const message = unwrapSdkMessage(entry.value);

  if (CEFSHARP_SCANNER_MESSAGE_PATTERN.test(message)) return true;

  if (RESIZE_OBSERVER_LOOP_MESSAGES.has(message)) return true;

  // Opaque cross-origin errors. Keep the rare case where frames somehow
  // survived sanitization so a real stack is never discarded.
  if (message === SCRIPT_ERROR_MESSAGE && !hasStackFrames(entry)) {
    return true;
  }

  // SuperTokens/browser network blips that escape as unhandledrejections.
  // The app already treats these as expected unavailability; capturing them
  // only creates noise. SuperTokens' session fetch often rejects outside our
  // `doesSessionExist` try/catch, so client-side catch alone can't cover it.
  return (
    entry.type === "TypeError" && isTransientBrowserNetworkMessage(message)
  );
};

/**
 * Drop known-unactionable `$exception` payloads in PostHog `before_send`.
 */
export function filterPosthogBeforeSend(
  event: CaptureResult | null,
): CaptureResult | null {
  if (event?.event !== "$exception") {
    return event;
  }

  const entries = readExceptionEntries(event.properties);
  if (entries.length === 0) {
    return event;
  }

  if (entries.every(isDroppableException)) {
    return null;
  }

  return event;
}
