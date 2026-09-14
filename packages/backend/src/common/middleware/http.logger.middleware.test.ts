import { type Request, type Response } from "express";
import { restoreFileMocks } from "@backend/__tests__/helpers/mock.setup";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { EventEmitter } from "node:events";

const makeRequest = (originalUrl: string): Request =>
  ({
    method: "GET",
    originalUrl,
    get ip() {
      throw new Error("request IP should not be read");
    },
  }) as unknown as Request;

const runMiddleware = async (url: string, logLevel?: string) => {
  if (logLevel !== undefined) {
    process.env["LOG_LEVEL"] = logLevel;
  } else {
    delete process.env["LOG_LEVEL"];
  }

  delete require.cache[require.resolve("./http.logger.middleware")];
  const { httpLoggingMiddleware } = await import("./http.logger.middleware");

  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
  }) as unknown as Response;
  const next = mock();

  httpLoggingMiddleware(makeRequest(url), res, next);
  res.emit("finish");

  return { next };
};

describe("httpLoggingMiddleware", () => {
  const originalLogLevel = process.env["LOG_LEVEL"];

  afterEach(() => {
    restoreFileMocks();
    process.env["LOG_LEVEL"] = originalLogLevel;
  });

  it("logs completed requests without reading the request IP address", async () => {
    const { next } = await runMiddleware("/api/event");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does not log health checks at the default log level", async () => {
    const { next } = await runMiddleware("/api/health", "info");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("logs health checks when LOG_LEVEL is debug", async () => {
    const { next } = await runMiddleware("/api/health?foo=bar", "debug");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("accepts a public booking URL without reading the request IP", async () => {
    const { next } = await runMiddleware(
      "/api/booking/reservations/507f1f77bcf86cd799439011/cancel?token=sentinel-capability-token-9f3c",
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
