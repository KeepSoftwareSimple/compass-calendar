import { ObjectId } from "mongodb";
import { Status } from "@core/errors/status.codes";
import { type HostGuestRsvpSummarizeRequest } from "@core/types/sync/host-guest-rsvp.contracts";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { UserDriver } from "@backend/__tests__/drivers/user.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { hostGuestRsvpNoticeRepository } from "@backend/booking/host-guest-rsvp-notice.repository";
import hostGuestRsvpNoticeService from "@backend/booking/services/host-guest-rsvp-notice.service";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import userService from "@backend/user/services/user.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";

const observationId = () => new ObjectId().toString();

type MockSummarizeReply = {
  id: string;
  guestName: string;
  responseStatus: "accepted" | "declined" | "tentative";
  slotStart: string;
  firstObservedAt: string;
};

const repliesAfterCursor = (
  replies: MockSummarizeReply[],
  cursor: HostGuestRsvpSummarizeRequest["cursor"],
): MockSummarizeReply[] => {
  const cursorMs = new Date(cursor.firstObservedAt).getTime();
  return replies.filter((reply) => {
    const replyMs = new Date(reply.firstObservedAt).getTime();
    if (replyMs > cursorMs) {
      return true;
    }
    if (replyMs < cursorMs) {
      return false;
    }
    if (!cursor.observationId) {
      return true;
    }
    return reply.id > cursor.observationId;
  });
};

describe("HostGuestRsvpNoticeService", () => {
  let syncSpies: Array<{ mockRestore: () => void }> = [];

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });

  beforeEach(async () => {
    await cleanupCollections();
    syncSpies.forEach((spy) => spy.mockRestore());
    syncSpies = [];
    syncServiceFactory.resetSyncServiceClientCacheForTests();
  });

  afterAll(cleanupTestDb);

  const createUserId = async () => {
    const created = await userService.createUser(
      UserDriver.generateGoogleUser({ name: "Host" }),
    );
    return new ObjectId(created.userId);
  };

  const mockSummarize = (
    count: number,
    latest: unknown | null,
    options?: { overlap?: "pair" },
  ) => {
    let summarizeWaiters = 0;
    let releaseSummarize: (() => void) | undefined;
    const summarizeOverlap = new Promise<void>((resolve) => {
      releaseSummarize = resolve;
    });
    const spy = spyOn(
      syncServiceFactory,
      "getSyncServiceClient",
    ).mockReturnValue({
      summarizeHostGuestRsvpReplies: async () => {
        if (options?.overlap === "pair") {
          summarizeWaiters += 1;
          if (summarizeWaiters >= 2) {
            releaseSummarize?.();
          }
          await summarizeOverlap;
        }
        return {
          ok: true,
          value: { count, latest },
        };
      },
    } as unknown as ReturnType<typeof syncServiceFactory.getSyncServiceClient>);
    syncSpies.push(spy);
  };

  const mockSummarizeBacklog = (replies: MockSummarizeReply[]) => {
    const spy = spyOn(
      syncServiceFactory,
      "getSyncServiceClient",
    ).mockReturnValue({
      summarizeHostGuestRsvpReplies: async (
        body: HostGuestRsvpSummarizeRequest,
      ) => {
        const newer = repliesAfterCursor(replies, body.cursor);
        const latest = newer.length > 0 ? newer[newer.length - 1]! : null;
        return {
          ok: true,
          value: { count: newer.length, latest },
        };
      },
    } as unknown as ReturnType<typeof syncServiceFactory.getSyncServiceClient>);
    syncSpies.push(spy);
  };

  it("claims backlog on first stamp using the epoch cursor", async () => {
    const userId = await createUserId();
    const observed = "2026-11-08T08:00:00.000Z";
    const id = observationId();
    mockSummarize(1, {
      id,
      guestName: "Jen",
      responseStatus: "accepted",
      slotStart: "2026-11-23T18:00:00.000Z",
      firstObservedAt: observed,
    });

    const claim =
      await hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId);
    expect(claim.count).toBe(1);
    expect(claim.latest?.guestName).toBe("Jen");
    expect(claim.whileYouWereAway).toBe(true);

    const state = await hostGuestRsvpNoticeRepository.findOrCreate(userId);
    expect(state.noticedAt?.toISOString()).toBe(observed);
  });

  it("claims concurrently so only one tab wins the batch", async () => {
    const userId = await createUserId();
    const observedA = "2026-11-08T08:00:00.000Z";
    const observedB = "2026-11-08T09:00:00.000Z";
    const idA = new ObjectId().toString();
    const idB = new ObjectId().toString();
    const ada = {
      id: idA,
      guestName: "Ada",
      responseStatus: "accepted" as const,
      slotStart: "2026-11-23T18:00:00.000Z",
      firstObservedAt: observedA,
    };
    const bob = {
      id: idB,
      guestName: "Bob",
      responseStatus: "declined" as const,
      slotStart: "2026-11-24T18:00:00.000Z",
      firstObservedAt: observedB,
    };
    mockSummarize(1, ada);

    const first =
      await hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId);
    expect(first.count).toBe(1);

    mockSummarize(1, bob, { overlap: "pair" });

    const [second, third] = await Promise.all([
      hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId),
      hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId),
    ]);
    const counts = [second.count, third.count].sort((a, b) => a - b);
    expect(counts).toEqual([0, 1]);
  });

  it("returns empty claim when summarize latest is already the noticed observation", async () => {
    const userId = await createUserId();
    const observedA = "2026-11-08T08:00:00.000Z";
    const observedB = "2026-11-08T09:00:00.000Z";
    const idA = new ObjectId().toString();
    const idB = new ObjectId().toString();
    const ada = {
      id: idA,
      guestName: "Ada",
      responseStatus: "accepted" as const,
      slotStart: "2026-11-23T18:00:00.000Z",
      firstObservedAt: observedA,
    };
    const bob = {
      id: idB,
      guestName: "Bob",
      responseStatus: "declined" as const,
      slotStart: "2026-11-24T18:00:00.000Z",
      firstObservedAt: observedB,
    };
    mockSummarize(1, ada);

    const first =
      await hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId);
    expect(first.count).toBe(1);

    mockSummarizeBacklog([ada, bob]);
    const stamped =
      await hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId);
    expect(stamped.count).toBe(1);

    mockSummarize(1, {
      id: idB,
      guestName: "Bob",
      responseStatus: "declined",
      slotStart: "2026-11-24T18:00:00.000Z",
      firstObservedAt: observedB,
    });

    const staleSummarizeWin =
      await hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId);
    expect(staleSummarizeWin.count).toBe(0);
  });

  it("stampNoticedAt rejects re-stamping the same observation id", async () => {
    const userId = await createUserId();
    await hostGuestRsvpNoticeRepository.findOrCreate(userId);
    const at = new Date("2026-11-08T09:00:00.000Z");
    const obs = new ObjectId();
    const initial = await hostGuestRsvpNoticeRepository.stampNoticedAt(
      userId,
      { at: undefined },
      { at, observationId: obs },
    );
    expect(initial).toBe(true);

    const duplicate = await hostGuestRsvpNoticeRepository.stampNoticedAt(
      userId,
      { at, observationId: obs },
      { at, observationId: obs },
    );
    expect(duplicate).toBe(false);
  });

  it("does not advance the watermark when summarize fails", async () => {
    const userId = await createUserId();
    const spy = spyOn(
      syncServiceFactory,
      "getSyncServiceClient",
    ).mockReturnValue({
      summarizeHostGuestRsvpReplies: async () => ({
        ok: false,
        error: { kind: "unavailable", correlationId: "corr", detail: null },
      }),
    } as unknown as ReturnType<typeof syncServiceFactory.getSyncServiceClient>);
    syncSpies.push(spy);

    await expect(
      hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId),
    ).rejects.toThrow();

    const state = await hostGuestRsvpNoticeRepository.findOrCreate(userId);
    expect(state.noticedAt).toBeUndefined();
  });

  it("POST /api/booking/page/guest-rsvp-replies/claim requires a session", async () => {
    const baseDriver = new BaseDriver();
    const response = await baseDriver
      .getServer()
      .post("/api/booking/page/guest-rsvp-replies/claim");
    expect(response.status).toBe(Status.UNAUTHORIZED);
  });
});
