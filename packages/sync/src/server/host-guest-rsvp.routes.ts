import {
  type Express,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { ObjectId } from "mongodb";
import { Status } from "@core/errors/status.codes";
import {
  HostGuestRsvpSummarizeRequestSchema,
  HostGuestRsvpSummarizeResponseSchema,
} from "@core/types/sync/host-guest-rsvp.contracts";
import {
  ensureConnected,
  internalRateLimit,
  respondInternalError,
} from "@sync/server/internal-http";
import { HostGuestRsvpObservationRepository } from "@sync/storage/repositories/host-guest-rsvp-observation.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";

export const HOST_GUEST_RSVP_SUMMARIZE_PATH =
  "/internal/host-guest-rsvp/summarize";

export interface HostGuestRsvpApiDeps {
  authMiddleware: RequestHandler;
  mongo: SyncMongoService;
}

export function mountHostGuestRsvpRoutes(
  app: Express,
  deps: HostGuestRsvpApiDeps,
): void {
  app.post(
    HOST_GUEST_RSVP_SUMMARIZE_PATH,
    deps.authMiddleware,
    internalRateLimit,
    async (req: Request, res: Response) => {
      if (!ensureConnected(deps.mongo, res)) return;

      const parsed = HostGuestRsvpSummarizeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(Status.BAD_REQUEST).json({
          status: "INVALID_INPUT",
          message: "Invalid summarize request",
        });
        return;
      }

      try {
        const observations = new HostGuestRsvpObservationRepository(
          deps.mongo.db,
        );
        const summary = await observations.summarizeSince(
          parsed.data.principalId,
          {
            firstObservedAt: new Date(parsed.data.cursor.firstObservedAt),
            observationId: parsed.data.cursor.observationId
              ? new ObjectId(parsed.data.cursor.observationId)
              : undefined,
          },
        );

        const response = HostGuestRsvpSummarizeResponseSchema.parse({
          count: summary.count,
          latest: summary.latest
            ? {
                id: summary.latest._id,
                guestName: summary.latest.guestName,
                responseStatus: summary.latest.responseStatus,
                slotStart: summary.latest.slotStart.toISOString(),
                firstObservedAt: summary.latest.firstObservedAt.toISOString(),
              }
            : null,
        });
        res.status(Status.OK).json(response);
      } catch {
        respondInternalError(res);
      }
    },
  );
}
