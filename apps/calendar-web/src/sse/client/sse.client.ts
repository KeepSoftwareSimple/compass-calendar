import { SSE_MESSAGE_EVENT } from "@core/constants/sse.constants";
import { Status } from "@core/errors/status.codes";
import {
  type ServerMessage,
  ServerMessageSchema,
} from "@core/types/server-message.contracts";
import { session } from "@web/auth/compass/session/Session";
import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { createExternalStore } from "@web/common/utils/external-store.util";
import { openAuthModalFromOutsideRouter } from "@web/common/utils/toast/session-expired.toast";

// The backend publishes one `message` SSE event per B10; its JSON `data` is a
// ServerMessageSchema member. This module is the single parse point: every
// consumer subscribes here by the message's own `type` and receives the
// already-validated ServerMessage, never the raw EventSource payload.
const listenersByType = new Map<
  ServerMessage["type"],
  Set<(message: ServerMessage) => void>
>();

function getListeners(
  type: ServerMessage["type"],
): Set<(message: ServerMessage) => void> {
  let listeners = listenersByType.get(type);
  if (!listeners) {
    listeners = new Set();
    listenersByType.set(type, listeners);
  }
  return listeners;
}

const reopenListeners = new Set<() => void>();

// Native EventSource does not expose WebSocket-style close codes. Classify
// from the signals the browser does give us so PostHog can split the
// sse_connection_degraded series instead of a single unlabelled count.
type SseDegradedErrorType =
  | "network_error"
  | "timeout"
  | "server_closed"
  | "auth_rejected";
type SseStoppedReason = "auth" | "max_attempts";

let es: EventSource | null = null;
let forwardingHandler: ((e: MessageEvent) => void) | null = null;
let openHandler: (() => void) | null = null;
let errorHandler: (() => void) | null = null;
let degradedTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectCount = 0;
let episodeErrorCount = 0;
let hasReportedDegraded = false;
let connectionOpenedAtMs: number | null = null;
let connectionDurationMs = 0;
let userEventCount = 0;
let lastErrorType: SseDegradedErrorType = "timeout";
let awaitingReconnect = false;
let reconnectGeneration = 0;
let stoppedReason: SseStoppedReason | undefined;
let pendingServerCloseReconnect = false;

const DEGRADED_AFTER_MS = 15_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_EPISODE_ERRORS = 10;

function classifySseError(source: EventSource | null): SseDegradedErrorType {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "network_error";
  }
  if (source?.readyState === EventSource.CLOSED) {
    return "server_closed";
  }
  return "timeout";
}

function currentPagePath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

// Analytics must never interrupt the stream lifecycle it observes, so every
// capture from this module goes through here. `page_path` is on every series,
// so it is added here rather than remembered at each call site.
function captureSseEvent(
  event: string,
  properties: Record<string, unknown>,
): void {
  try {
    getPosthogClient()?.capture(event, {
      ...properties,
      page_path: currentPagePath(),
    });
  } catch {
    // Reporting a dead stream must not be what kills the reconnect loop.
  }
}

// An "episode" is one run of consecutive errors between healthy opens. Both
// `closeStream` and the open handler end one, and every field they share has
// to be cleared by both: a field reset in only one of them is how a stale
// `hasReportedDegraded` or `pendingServerCloseReconnect` leaks into the next
// episode and mislabels its analytics.
function resetEpisodeDiagnostics() {
  episodeErrorCount = 0;
  hasReportedDegraded = false;
  userEventCount = 0;
  lastErrorType = "timeout";
  awaitingReconnect = false;
  stoppedReason = undefined;
  pendingServerCloseReconnect = false;
}

// Only `closeStream` also ends the reconnect *attempt* history; the open
// handler keeps `reconnectCount` so a recovery reports how many tries it took.
function resetConnectionDiagnostics() {
  resetEpisodeDiagnostics();
  reconnectCount = 0;
  connectionOpenedAtMs = null;
  connectionDurationMs = 0;
}

function reconnectDelayMs(errorCount: number): number {
  const n = Math.max(0, errorCount - 1);
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** n);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(base + jitter));
}

// A thrown 401/403 is the session answering "no", not the session call
// failing. Anything else is a transport problem and must not be read as a
// signed-out user: that would close the stream and prompt a login on a blip.
function isAuthRejection(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }
  const status = (error as { status: unknown }).status;
  return status === Status.UNAUTHORIZED || status === Status.FORBIDDEN;
}

async function sessionAllowsSseReconnect(): Promise<boolean> {
  try {
    return await session.doesSessionExist();
  } catch (error) {
    return !isAuthRejection(error);
  }
}

async function refreshedSessionForReconnect(): Promise<boolean> {
  try {
    return await session.attemptRefreshingSession();
  } catch (error) {
    if (isAuthRejection(error)) return false;
    throw error;
  }
}

// Epoch ms at which the live stream had been down long enough that displayed
// data can no longer be trusted as fresh, or null while healthy. Previously
// this was analytics-only (sse_connection_degraded, PostHog) with no UI
// representation at all: a tab with a dead stream kept showing "Calendar
// connected" and a "Updated N minutes ago" timestamp that both silently
// stopped being true. The timestamp (not a boolean) lets the header offer a
// reload once an outage has outlived native reconnect's usefulness, and it
// survives header remounts on view switches.
const sseDegradedSinceStore = createExternalStore<number | null>(null);

export function isSseDegraded(): boolean {
  return sseDegradedSinceStore.get() !== null;
}

export function getSseDegradedSinceMs(): number | null {
  return sseDegradedSinceStore.get();
}

export function subscribeSseDegraded(onChange: () => void): () => void {
  return sseDegradedSinceStore.subscribe(onChange);
}

function clearDegradedTimer() {
  if (degradedTimer !== null) {
    clearTimeout(degradedTimer);
    degradedTimer = null;
  }
}

function reportSseDegraded() {
  // The timer re-arms on every error, so it can fire more than once per
  // outage; the badge keeps the first timestamp.
  if (sseDegradedSinceStore.get() === null) {
    sseDegradedSinceStore.set(Date.now());
  }
  if (hasReportedDegraded) return;
  hasReportedDegraded = true;
  captureSseEvent("sse_connection_degraded", {
    reconnect_count: reconnectCount,
    error_type: lastErrorType,
    connection_duration_ms: connectionDurationMs,
    retry_attempt: Math.max(0, episodeErrorCount - 1),
    user_event_count: userEventCount,
    ...(stoppedReason !== undefined ? { stopped_reason: stoppedReason } : {}),
  });
}

function armDegradedTimer() {
  clearDegradedTimer();
  degradedTimer = setTimeout(() => {
    if (awaitingReconnect || (es && es.readyState !== EventSource.OPEN)) {
      reportSseDegraded();
    }
  }, DEGRADED_AFTER_MS);
}

function clearReconnectTimer() {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function teardownEventSource() {
  if (es && forwardingHandler) {
    es.removeEventListener(SSE_MESSAGE_EVENT, forwardingHandler);
  }
  if (es && openHandler) {
    es.removeEventListener("open", openHandler);
  }
  if (es && errorHandler) {
    es.removeEventListener("error", errorHandler);
  }
  es?.close();
  es = null;
  forwardingHandler = null;
  openHandler = null;
  errorHandler = null;
}

function stopReconnecting(reason: SseStoppedReason) {
  stoppedReason = reason;
  awaitingReconnect = true;
  clearReconnectTimer();
  clearDegradedTimer();
  reportSseDegraded();
  if (reason === "auth") {
    void openAuthModalFromOutsideRouter("login");
  }
}

async function handleStreamError() {
  if (!es) return;
  reconnectCount += 1;
  episodeErrorCount += 1;
  lastErrorType = classifySseError(es);
  if (lastErrorType === "server_closed") {
    pendingServerCloseReconnect = true;
  } else if (pendingServerCloseReconnect && episodeErrorCount > 1) {
    lastErrorType = "auth_rejected";
  }
  if (episodeErrorCount === 1) {
    connectionDurationMs =
      connectionOpenedAtMs === null
        ? 0
        : Math.max(0, Date.now() - connectionOpenedAtMs);
  }
  awaitingReconnect = true;
  const generation = reconnectGeneration;
  armDegradedTimer();
  teardownEventSource();

  if (episodeErrorCount >= MAX_EPISODE_ERRORS) {
    stopReconnecting("max_attempts");
    return;
  }

  if (lastErrorType === "server_closed" || lastErrorType === "auth_rejected") {
    const refreshed = await refreshedSessionForReconnect();
    if (generation !== reconnectGeneration) return;
    if (!refreshed) {
      stopReconnecting("auth");
      return;
    }
  }

  const allowed = await sessionAllowsSseReconnect();
  if (generation !== reconnectGeneration) return;
  if (!allowed) {
    stopReconnecting("auth");
    return;
  }

  const delayMs = reconnectDelayMs(episodeErrorCount);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (generation !== reconnectGeneration) return;
    openStream();
  }, delayMs);
}

export const openStream = (): EventSource => {
  if (es) return es;
  es = new EventSource(`${ENV_WEB.BACKEND_BASEURL}/api/events/stream`, {
    withCredentials: true,
  });
  forwardingHandler = (e: MessageEvent) => {
    userEventCount += 1;
    let raw: unknown;
    try {
      raw = JSON.parse(e.data as string);
    } catch {
      // eslint-disable-next-line no-console
      console.error("[sse] malformed message payload", e.data);
      return;
    }

    const parsed = ServerMessageSchema.safeParse(raw);
    if (!parsed.success) {
      // eslint-disable-next-line no-console
      console.error("[sse] unrecognized message shape", parsed.error, raw);
      return;
    }

    for (const listener of getListeners(parsed.data.type)) {
      listener(parsed.data);
    }
  };
  // Native EventSource reconnects after laptop sleep without going through
  // openStream() again; the open event is the seam that refetches the gap.
  // After we own the reconnect loop, the same handler still refetches the
  // missed window and resets the episode error budget.
  openHandler = () => {
    const degradedSinceMs = sseDegradedSinceStore.get();
    clearDegradedTimer();
    resetEpisodeDiagnostics();
    connectionOpenedAtMs = Date.now();
    sseDegradedSinceStore.set(null);
    if (degradedSinceMs !== null) {
      captureSseEvent("sse_connection_recovered", {
        downtime_ms: Math.max(0, Date.now() - degradedSinceMs),
        reconnect_count: reconnectCount,
      });
    }
    for (const listener of reopenListeners) {
      listener();
    }
  };
  errorHandler = () => {
    void handleStreamError();
  };
  es.addEventListener(SSE_MESSAGE_EVENT, forwardingHandler);
  es.addEventListener("open", openHandler);
  es.addEventListener("error", errorHandler);
  return es;
};

export const closeStream = (): void => {
  reconnectGeneration += 1;
  clearDegradedTimer();
  clearReconnectTimer();
  sseDegradedSinceStore.set(null);
  teardownEventSource();
  resetConnectionDiagnostics();
};

export const getStream = (): EventSource | null => es;

// Typed subscribe helper so hooks never have to re-narrow `ServerMessage` by
// hand; the emitter is otherwise stringly-typed (EventEmitter2's own API).
export function onServerMessage<T extends ServerMessage["type"]>(
  type: T,
  handler: (message: Extract<ServerMessage, { type: T }>) => void,
): () => void {
  const listener = (message: ServerMessage) => handler(message as never);
  const listeners = getListeners(type);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onStreamReopen(handler: () => void): () => void {
  reopenListeners.add(handler);
  return () => {
    reopenListeners.delete(handler);
  };
}

export type OnServerMessage = typeof onServerMessage;
