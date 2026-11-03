import { type Express } from "express";
import {
  ReflectionImportRequestSchema,
  ReflectionReadRequestSchema,
  ReflectionReadResponseSchema,
} from "@core/types/sync/reflection.contracts";
import { readReflectionPage } from "@sync/domain/reflection-read.service";
import { type ConnectionApiDeps } from "@sync/server/connection.routes";
import {
  ensureConnected,
  internalRateLimit,
  requireAuth,
  respondInternalError,
} from "@sync/server/internal-http";
import { resourceJob } from "@sync/storage/contracts/job.contracts";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export function registerReflectionRoutes(
  app: Express,
  deps: Pick<
    ConnectionApiDeps,
    "authMiddleware" | "mongo" | "registry" | "execution"
  >,
) {
  app.post(
    "/internal/reflection/import",
    internalRateLimit,
    deps.authMiddleware,
    async (req, res) => {
      const auth = requireAuth(req, res);
      if (!auth || !ensureConnected(deps.mongo, res)) return;
      if (deps.execution !== "active") {
        res.status(409).json({ error: "passive_mode" });
        return;
      }
      const parsed = ReflectionImportRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_query" });
        return;
      }
      try {
        const resources = await new SyncResourceRepository(
          deps.mongo.db,
        ).listEventsByPrincipal(auth.tenantId, auth.principalId);
        const connections = await new ProviderConnectionRepository(
          deps.mongo.db,
        ).listByPrincipal(auth.tenantId, auth.principalId);
        const jobs = new JobRepository(deps.mongo.db);
        let queued = 0;
        const unsupportedCalendars: string[] = [];
        for (const resource of resources) {
          if (
            !resource.calendarId ||
            !parsed.data.calendarIds.includes(resource.calendarId) ||
            resource.historyCoverageVersion === 1
          )
            continue;
          const connection = connections.find(
            (item) => item._id === resource.connectionId,
          );
          const registration =
            connection && deps.registry?.has(connection.provider)
              ? deps.registry.get(connection.provider)
              : null;
          if (!registration?.adapters.reader.supportsFullHistory) {
            unsupportedCalendars.push(resource.calendarId);
            continue;
          }
          await jobs.enqueue(
            resourceJob(
              resource,
              resource.syncCursor ? "repair" : "initialImport",
              new Date(),
            ),
          );
          queued++;
        }
        res.json({ queued, unsupportedCalendars });
      } catch {
        respondInternalError(res);
      }
    },
  );
  app.post(
    "/internal/reflection/read",
    internalRateLimit,
    deps.authMiddleware,
    async (req, res) => {
      const auth = requireAuth(req, res);
      if (!auth || !ensureConnected(deps.mongo, res)) return;
      const parsed = ReflectionReadRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "invalid_query" });
        return;
      }
      try {
        const result = await readReflectionPage(
          deps.mongo.db,
          auth,
          parsed.data,
        );
        res.json(ReflectionReadResponseSchema.parse(result));
      } catch {
        respondInternalError(res);
      }
    },
  );
}
