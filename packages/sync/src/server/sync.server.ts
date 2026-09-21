import express, { type Express } from "express";
import { HTTP_JSON_BODY_LIMIT } from "@core/server/http-server";
import { type ReadinessRegistry } from "@sync/lifecycle/readiness";
import { registerChangeFeedRoutes } from "@sync/server/change-feed.routes";
import { registerCommandRoutes } from "@sync/server/command.routes";
import {
  type ConnectionApiDeps,
  registerConnectionRoutes,
} from "@sync/server/connection.routes";
import { registerContactsRoutes } from "@sync/server/contacts.routes";
import { registerDiagnosticRoutes } from "@sync/server/diagnostic.routes";
import { registerHealthRoutes } from "@sync/server/health.routes";
import { registerNotificationRoutes } from "@sync/server/notification.routes";
import { registerPrincipalRoutes } from "@sync/server/principal.routes";
import { type StructuredServiceIdentity } from "@sync/service-identity";

// Builds the Sync service's HTTP application. Health probes are always public
// and content-free. The internal connection API mounts only when its storage
// dependency is supplied, so the health-only paths need no database. OAuth /
// webhook ingress and query routes mount here in later commits.
export function buildSyncApp(deps: {
  identity: StructuredServiceIdentity;
  readiness: ReadinessRegistry;
  connectionApi?: ConnectionApiDeps;
}): Express {
  const app = express();
  // Caddy terminates TLS and proxies `/sync/*` with X-Forwarded-For. One hop
  // of trust keeps express-rate-limit from rejecting those public routes.
  app.set("trust proxy", 1);
  // Every query param here is flat, but the default "extended" parser (qs)
  // turns 21+ repeated keys into an object (arrayLimit: 20) — which broke
  // /internal/events/full for any user with more than 20 calendars. The
  // "simple" parser collects repeated keys into a plain array, unbounded.
  app.set("query parser", "simple");
  app.use(express.json({ limit: HTTP_JSON_BODY_LIMIT }));

  registerHealthRoutes(app, deps);
  if (deps.connectionApi) {
    registerConnectionRoutes(app, deps.connectionApi);
    // The command ingress shares the connection API's storage and auth. A
    // cloud-only command needs no provider adapter; a provider-targeted create
    // uses the writer + auth adapter when provider work is enabled.
    registerCommandRoutes(app, {
      authMiddleware: deps.connectionApi.authMiddleware,
      mongo: deps.connectionApi.mongo,
      execution: deps.connectionApi.execution,
      registry: deps.connectionApi.registry,
      credentialAtRestKey: deps.connectionApi.credentialAtRestKey,
      now: deps.connectionApi.now,
    });
    // Attendee contact suggestions from the provider's People surfaces, gated
    // on the optional per-connection contacts grant (WP-05).
    registerContactsRoutes(app, {
      authMiddleware: deps.connectionApi.authMiddleware,
      mongo: deps.connectionApi.mongo,
      execution: deps.connectionApi.execution,
      registry: deps.connectionApi.registry,
      credentialAtRestKey: deps.connectionApi.credentialAtRestKey,
    });
    // Resumable invalidation outbox for Compass API → browser SSE (S40).
    registerChangeFeedRoutes(app, {
      authMiddleware: deps.connectionApi.authMiddleware,
      serviceAuthMiddleware: deps.connectionApi.serviceAuthMiddleware,
      mongo: deps.connectionApi.mongo,
    });
    // Account-deletion hard purge for the signed principal (S43). Served in
    // passive mode; best-effort provider revoke when an auth adapter exists.
    registerPrincipalRoutes(app, {
      authMiddleware: deps.connectionApi.authMiddleware,
      mongo: deps.connectionApi.mongo,
      registry: deps.connectionApi.registry,
      credentialAtRestKey: deps.connectionApi.credentialAtRestKey,
    });
    // Private support diagnostic lookup by non-user-facing connection key (S45).
    registerDiagnosticRoutes(app, {
      authMiddleware: deps.connectionApi.authMiddleware,
      mongo: deps.connectionApi.mongo,
    });
    // The public webhook ingress shares the connection API's storage; it needs
    // no auth adapter or secrets, only the db and execution mode.
    registerNotificationRoutes(app, {
      mongo: deps.connectionApi.mongo,
      execution: deps.connectionApi.execution,
      registry: deps.connectionApi.registry,
      now: deps.connectionApi.now,
    });
  }

  return app;
}
