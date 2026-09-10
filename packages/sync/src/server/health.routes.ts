import { type Express, type Request, type Response } from "express";
import { POSTHOG_ERROR_TRACKING_PROPERTY } from "@core/constants/posthog-error-tracking.properties";
import { Status } from "@core/errors/status.codes";
import { type ReadinessRegistry } from "@sync/lifecycle/readiness";
import { type StructuredServiceIdentity } from "@sync/service-identity";

// Liveness and readiness endpoints for the Compass Sync service.
// These are content-free operational probes: they expose service identity and
// dependency readiness, never user, tenant, or provider data. Public health
// routes stay content-free.

export const LIVENESS_PATH = "/health/live";
export const READINESS_PATH = "/health/ready";

export function registerHealthRoutes(
  app: Express,
  deps: {
    identity: StructuredServiceIdentity;
    readiness: ReadinessRegistry;
  },
): void {
  // Liveness: the process is up and the event loop is responsive. It does not
  // check dependencies — a live-but-not-ready service should not be killed,
  // only kept out of rotation.
  app.get(LIVENESS_PATH, (_req: Request, res: Response) => {
    res.status(Status.OK).json({
      status: "alive",
      service: deps.identity.name,
      environment: deps.identity.environment,
      execution: deps.identity.execution,
    });
  });

  // Readiness: every registered dependency check passes. Returns 503 while any
  // check fails so orchestration keeps traffic away until the service is
  // genuinely ready (storage connected, indexes installed, etc.).
  app.get(READINESS_PATH, async (_req: Request, res: Response) => {
    const report = await deps.readiness.report();
    res.status(report.ready ? Status.OK : Status.SERVICE_UNAVAILABLE).json({
      status: report.ready ? "ready" : "not_ready",
      checks: report.checks,
      [POSTHOG_ERROR_TRACKING_PROPERTY.version]: deps.identity.version,
    });
  });
}
