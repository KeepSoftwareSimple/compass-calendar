import { ObjectId as MongoObjectId, type ObjectId } from "mongodb";
import { Logger } from "@core/logger/winston.logger";
import {
  type BookingGuestRsvpClaimResponse,
  BookingGuestRsvpClaimResponseSchema,
} from "@core/types/booking.contracts";
import { HostGuestRsvpSummarizeRequestSchema } from "@core/types/sync/host-guest-rsvp.contracts";
import { hostGuestRsvpSummarizeCursor } from "@backend/booking/host-guest-rsvp-notice.cursor";
import { hostGuestRsvpNoticeRepository } from "@backend/booking/host-guest-rsvp-notice.repository";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { unwrapSyncResult } from "@backend/common/services/sync-service/unwrap-sync-result";

const logger = Logger("app:host-guest-rsvp-notice");
const WHILE_YOU_WERE_AWAY_MS = 5 * 60 * 1000;

const emptyClaim = (): BookingGuestRsvpClaimResponse =>
  BookingGuestRsvpClaimResponseSchema.parse({
    count: 0,
    latest: null,
    whileYouWereAway: false,
  });

class HostGuestRsvpNoticeService {
  async claimGuestRsvpReplies(
    userId: ObjectId,
  ): Promise<BookingGuestRsvpClaimResponse> {
    const state = await hostGuestRsvpNoticeRepository.findOrCreate(userId);
    const summarizeBody = HostGuestRsvpSummarizeRequestSchema.parse({
      principalId: userId.toString(),
      cursor: hostGuestRsvpSummarizeCursor(state),
    });

    const summary = unwrapSyncResult(
      await getSyncServiceClient().summarizeHostGuestRsvpReplies(summarizeBody),
      {
        logger,
        logMessage: "Failed to summarize host guest RSVP replies",
        userMessage: "Could not check guest replies. Try again shortly.",
      },
    );

    if (summary.count === 0 || !summary.latest) {
      return emptyClaim();
    }

    if (
      state.noticedObservationId &&
      new MongoObjectId(summary.latest.id).equals(state.noticedObservationId)
    ) {
      return emptyClaim();
    }

    const stamped = await hostGuestRsvpNoticeRepository.stampNoticedAt(
      userId,
      {
        at: state.noticedAt,
        observationId: state.noticedObservationId,
      },
      {
        at: new Date(summary.latest.firstObservedAt),
        observationId: new MongoObjectId(summary.latest.id),
      },
    );
    if (!stamped) {
      return emptyClaim();
    }

    const firstObservedMs = new Date(summary.latest.firstObservedAt).getTime();
    const whileYouWereAway =
      firstObservedMs + WHILE_YOU_WERE_AWAY_MS < Date.now();

    return BookingGuestRsvpClaimResponseSchema.parse({
      count: summary.count,
      latest: {
        id: summary.latest.id,
        guestName: summary.latest.guestName,
        status: summary.latest.responseStatus,
        slotStart: summary.latest.slotStart,
        firstObservedAt: summary.latest.firstObservedAt,
      },
      whileYouWereAway,
    });
  }
}

export default new HostGuestRsvpNoticeService();
