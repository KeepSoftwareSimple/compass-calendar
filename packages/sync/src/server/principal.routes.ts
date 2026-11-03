import { type Express, type RequestHandler } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { PrincipalPurgeResponseSchema } from "@core/types/sync/principal.contracts";
import { CredentialCustody } from "@sync/credentials/credential-custody.service";
import { purgePrincipal } from "@sync/domain/principal-purge.service";
import {
  type ProviderRegistry,
  resolveAuthFrom,
} from "@sync/providers/provider-registry";
import { redactedCause } from "@sync/safety/redact-error";
import {
  ensureConnected,
  internalRateLimit,
  requireAuth,
  respondInternalError,
} from "@sync/server/internal-http";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { syncRepositories } from "@sync/storage/sync-repositories";

const logger = Logger("sync:principal.routes");

export const PRINCIPAL_PATH = "/internal/principal";

export interface PrincipalApiDeps {
  authMiddleware: RequestHandler;
  mongo: SyncMongoService;
  // Optional: when present with at least one kind, credentials are revoked at
  // the provider before local delete. Account deletion still proceeds without
  // it (passive / unconfigured deployments) so Sync-held tokens are never
  // stranded.
  registry: ProviderRegistry;
  credentialAtRestKey?: string;
}

// Hard-delete every Sync-held row for the signed principal. Served in passive
// mode too — account deletion must wipe Sync data even when provider work is
// disabled. Soft disconnect retention does NOT apply here.
export function registerPrincipalRoutes(
  app: Express,
  deps: PrincipalApiDeps,
): void {
  app.delete(
    PRINCIPAL_PATH,
    internalRateLimit,
    deps.authMiddleware,
    async (req, res) => {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (!ensureConnected(deps.mongo, res)) return;

      try {
        const repos = syncRepositories(deps.mongo);
        const counts = await purgePrincipal(
          {
            ...repos,
            custody:
              deps.registry.kinds().length > 0
                ? new CredentialCustody(
                    repos.credentials,
                    resolveAuthFrom(deps.registry),
                    { credentialEncryptionKey: deps.credentialAtRestKey },
                  )
                : undefined,
          },
          auth.tenantId,
          auth.principalId,
        );
        res.status(Status.OK).json(PrincipalPurgeResponseSchema.parse(counts));
      } catch (error) {
        // Account-deletion purge: the backend-side user doc is already gone by
        // the time this runs, so nothing else will ever retry a failure here.
        logger.error(
          `Failed to purge principal ${auth.tenantId}/${auth.principalId}`,
          redactedCause(error),
        );
        respondInternalError(res);
      }
    },
  );
}
