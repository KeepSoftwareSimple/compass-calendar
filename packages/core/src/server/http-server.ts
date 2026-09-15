import { type Server } from "node:http";

export type HttpServerLimits = {
  headersTimeoutMs: number;
  requestTimeoutMs: number;
  keepAliveTimeoutMs: number;
  maxHeadersCount: number;
  // 0 means no cap. Bun returns 503 once a keep-alive socket exceeds a
  // positive cap; Node treats 0 as unlimited.
  maxRequestsPerSocket: number;
};

// Public API behind Caddy. Caddy holds the browser-facing connection, so a
// short keep-alive and a request cap on this listener are fine.
export const HTTP_SERVER_LIMITS: HttpServerLimits = {
  headersTimeoutMs: 15_000,
  requestTimeoutMs: 60_000,
  keepAliveTimeoutMs: 5_000,
  maxHeadersCount: 100,
  maxRequestsPerSocket: 1_000,
};

// Internal Sync listener, spoken to by the backend on the same host. The
// change-feed poll is slower than 5s, so a 5s keep-alive kills the pooled
// socket between ticks and the next write pays ECONNRESET. 65s covers the
// cadence. No request cap: of the five node:http knobs, Bun only enforces
// maxRequestsPerSocket, and it answers 503 after the cap.
export const INTERNAL_HTTP_SERVER_LIMITS: HttpServerLimits = {
  ...HTTP_SERVER_LIMITS,
  keepAliveTimeoutMs: 65_000,
  maxRequestsPerSocket: 0,
};

export function configureHttpServer(
  server: Server,
  limits: HttpServerLimits = HTTP_SERVER_LIMITS,
): Server {
  server.headersTimeout = limits.headersTimeoutMs;
  server.requestTimeout = limits.requestTimeoutMs;
  server.keepAliveTimeout = limits.keepAliveTimeoutMs;
  server.maxHeadersCount = limits.maxHeadersCount;
  server.maxRequestsPerSocket = limits.maxRequestsPerSocket;
  return server;
}
