import { type Request, type Response } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  logMongoNetworkError,
  withTransientMongoRetry,
} from "@core/util/mongo-network-error.util";
import mongoService from "@backend/common/services/mongo.service";

interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
}

const logger = Logger("app:health.controller");

// Ride out brief Atlas/DNS blips without failing the probe on the first
// interrupted ping. Bound each attempt so retries cannot stack into a
// multi-minute serverSelectionTimeoutMS wait for load balancers.
const HEALTH_PING_ATTEMPTS = 3;
const HEALTH_PING_DELAY_MS = 200;
const HEALTH_PING_TIMEOUT_MS = 2_500;

class HealthController {
  /**
   * GET /api/health
   * Health check endpoint that verifies basic system connectivity
   *
   * @returns {Object} Health status with timestamp
   * @returns {200} OK - Database is reachable
   * @returns {500} Internal Server Error - Database is unreachable
   */
  check = async (
    _req: Request<never, HealthResponse, never, never>,
    res: Response<HealthResponse>,
  ) => {
    const timestamp = new Date().toISOString();

    try {
      await withTransientMongoRetry(
        () =>
          mongoService.db.admin().ping({ timeoutMS: HEALTH_PING_TIMEOUT_MS }),
        {
          attempts: HEALTH_PING_ATTEMPTS,
          delayMs: HEALTH_PING_DELAY_MS,
        },
      );

      res.status(Status.OK).json({
        status: "ok",
        timestamp,
      });
    } catch (error) {
      logMongoNetworkError(logger, "Database connectivity check failed", error);
      res.status(Status.INTERNAL_SERVER).json({
        status: "error",
        timestamp,
      });
    }
  };
}

export default new HealthController();
