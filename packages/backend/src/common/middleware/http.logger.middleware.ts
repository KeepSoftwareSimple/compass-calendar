import { type RequestHandler } from "express";
import { redactBookingUrl } from "@core/booking/booking-telemetry";
import { Logger } from "@core/logger/winston.logger";
import { styleText } from "node:util";

const logger = Logger("app:http");

type HttpLogColor = "cyanBright" | "yellow" | "red" | "magentaBright";

// The load balancer / Docker health check hits this every ~10s, which floods
// the logs when tailing staging/prod. We log it at debug level so it stays out
// of the default (info) tail; set LOG_LEVEL=debug to see health checks again.
const HEALTH_CHECK_PATH = "/api/health";

const getStatusColor = (status: string): HttpLogColor => {
  switch (status[0]) {
    case "1":
    case "2": {
      return "cyanBright";
    }
    case "3": {
      return "yellow";
    }
    case "4":
    case "5": {
      return "red";
    }
    default: {
      return "magentaBright";
    }
  }
};

export const httpLoggingMiddleware: RequestHandler = (req, res, next) => {
  const startTime = process.hrtime.bigint();

  res.once("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    const status = String(res.statusCode);
    const statusColor = getStatusColor(status);
    const method = req.method || "unknown";
    const url = redactBookingUrl(req.originalUrl || req.url || "unknown");

    const isHealthCheck = url.split("?")[0] === HEALTH_CHECK_PATH;
    const logLevel = isHealthCheck ? "debug" : "info";

    const coloredMessage = [
      styleText(["bold", statusColor], status),
      styleText(["bold", "whiteBright"], method),
      styleText(["bold", "cyanBright"], url),
      styleText(["bold", "blueBright"], `${elapsedMs.toFixed(3)}ms`),
      styleText(["bold", "magentaBright"], new Date().toUTCString()),
    ].join(" ");

    logger.log(logLevel, coloredMessage, {
      method,
      path: url,
      status: res.statusCode,
      durationMs: elapsedMs,
    });
  });

  next();
};
