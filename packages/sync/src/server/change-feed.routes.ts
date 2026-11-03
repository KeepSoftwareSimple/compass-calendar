import {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  ChangeFeedResponseSchema,
  ChangeFeedResumeQuerySchema,
  GlobalChangeFeedResponseSchema,
} from "@core/types/sync/change-feed.contracts";
import { logMongoNetworkError } from "@core/util/mongo-network-error.util";
import {
  readChangeFeed,
  readGlobalChangeFeed,
} from "@sync/domain/change-feed.service";
import { redactedCause } from "@sync/safety/redact-error";
import {
  ensureConnected,
  internalRateLimit,
  requireAuth,
  respondInternalError,
} from "@sync/server/internal-http";
import { InvalidationRepository } from "@sync/storage/repositories/invalidation.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";

const logger = Logger("sync:change-feed.routes");

export const CHANGES_PATH = "/internal/changes";
// The global (cross-tenant) variant: one multiplexed poll for the whole
// backend process instead of one poller per connected user (S-multiplex).
// Guarded by serviceAuthMiddleware, not authMiddleware — this request acts on
// behalf of no single tenant/principal.
export const CHANGES_ALL_PATH = "/internal/changes/all";

export interface ChangeFeedApiDeps {
  authMiddleware: RequestHandler;
  serviceAuthMiddleware: RequestHandler;
  mongo: SyncMongoService;
}

// Omit / empty / explicit "null" → resume from now. A repeated query key
// arrives as an array from Express and is rejected. Returns `undefined` when
// the request was already responded to (400).
function parseCursorQuery(
  req: Request,
  res: Response,
): string | null | undefined {
  const rawCursor = req.query["cursor"];
  let cursor: string | null = null;
  if (rawCursor !== undefined) {
    if (Array.isArray(rawCursor) || typeof rawCursor !== "string") {
      res.status(Status.BAD_REQUEST).json({ error: "invalid_cursor" });
      return undefined;
    }
    if (rawCursor !== "" && rawCursor !== "null") {
      cursor = rawCursor;
    }
  }
  return cursor;
}

// Internal, authenticated change-feed poll. Serves content-free invalidation
// envelopes for the signed principal. Read-only against the outbox, so it is
// available in passive mode. Tenant/principal come from signed auth headers —
// never from the query.
export function registerChangeFeedRoutes(
  app: Express,
  deps: ChangeFeedApiDeps,
): void {
  app.get(
    CHANGES_PATH,
    internalRateLimit,
    deps.authMiddleware,
    async (req, res) => {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (!ensureConnected(deps.mongo, res)) return;

      const cursor = parseCursorQuery(req, res);
      if (cursor === undefined) return;
      const parsed = ChangeFeedResumeQuerySchema.safeParse({ cursor });
      if (!parsed.success) {
        res.status(Status.BAD_REQUEST).json({ error: "invalid_cursor" });
        return;
      }

      try {
        const response = await readChangeFeed(
          { invalidations: new InvalidationRepository(deps.mongo.db) },
          auth.tenantId,
          auth.principalId,
          parsed.data.cursor,
        );
        res.status(Status.OK).json(ChangeFeedResponseSchema.parse(response));
      } catch (error) {
        logger.error("Failed to read change feed", redactedCause(error));
        respondInternalError(res);
      }
    },
  );

  // The global (cross-tenant) poll a single backend process runs instead of
  // one poller per connected user. Read-only, available in passive mode.
  app.get(
    CHANGES_ALL_PATH,
    internalRateLimit,
    deps.serviceAuthMiddleware,
    async (req, res) => {
      if (!ensureConnected(deps.mongo, res)) return;

      const cursor = parseCursorQuery(req, res);
      if (cursor === undefined) return;
      const parsed = ChangeFeedResumeQuerySchema.safeParse({ cursor });
      if (!parsed.success) {
        res.status(Status.BAD_REQUEST).json({ error: "invalid_cursor" });
        return;
      }

      try {
        const response = await readGlobalChangeFeed(
          { invalidations: new InvalidationRepository(deps.mongo.db) },
          parsed.data.cursor,
        );
        res
          .status(Status.OK)
          .json(GlobalChangeFeedResponseSchema.parse(response));
      } catch (error) {
        logMongoNetworkError(
          logger,
          "Failed to read global change feed",
          error,
          redactedCause(error),
        );
        respondInternalError(res);
      }
    },
  );
}
