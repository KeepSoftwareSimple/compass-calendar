import { ObjectId } from "mongodb";
import { Status } from "@core/errors/status.codes";
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
import { SyncServiceClient } from "@backend/common/services/sync-service/sync-service.client";
import {
  getSyncServiceClient,
  resetSyncServiceClientCacheForTests,
} from "@backend/common/services/sync-service/sync-service.factory";
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

describe("HostGuestRsvpNoticeService", () => {
  let summarizeSpy: ReturnType<typeof spyOn> | undefined;

  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });

  beforeEach(async () => {
    await cleanupCollections();
    summarizeSpy?.mockRestore();
    summarizeSpy = undefined;
    resetSyncServiceClientCacheForTests();
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
    getSyncServiceClient();
    let summarizeWaiters = 0;
    let releaseSummarize: (() => void) | undefined;
    const summarizeOverlap = new Promise<void>((resolve) => {
      releaseSummarize = resolve;
    });
    summarizeSpy = spyOn(
      SyncServiceClient.prototype,
      "summarizeHostGuestRsvpReplies",
    ).mockImplementation(async () => {
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
    });
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
    mockSummarize(1, {
      id: observationId(),
      guestName: "Ada",
      responseStatus: "accepted",
      slotStart: "2026-11-23T18:00:00.000Z",
      firstObservedAt: observedA,
    });

    const first =
      await hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId);
    expect(first.count).toBe(1);

    mockSummarize(
      1,
      {
        id: observationId(),
        guestName: "Bob",
        responseStatus: "declined",
        slotStart: "2026-11-24T18:00:00.000Z",
        firstObservedAt: observedB,
      },
      { overlap: "pair" },
    );

    const [second, third] = await Promise.all([
      hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId),
      hostGuestRsvpNoticeService.claimGuestRsvpReplies(userId),
    ]);
    const counts = [second.count, third.count].sort((a, b) => a - b);
    expect(counts).toEqual([0, 1]);
  });

  it("does not advance the watermark when summarize fails", async () => {
    const userId = await createUserId();
    getSyncServiceClient();
    summarizeSpy = spyOn(
      SyncServiceClient.prototype,
      "summarizeHostGuestRsvpReplies",
    ).mockResolvedValue({
      ok: false,
      error: { kind: "unavailable", correlationId: "corr", detail: null },
    });

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
