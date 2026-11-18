import { ObjectId } from "mongodb";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { hostGuestRsvpNoticeRepository } from "@backend/booking/host-guest-rsvp-notice.repository";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";

describe("HostGuestRsvpNoticeRepository", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });

  beforeEach(async () => {
    await cleanupCollections();
  });

  afterAll(cleanupTestDb);

  it("stamps concurrently so only one caller wins the watermark", async () => {
    const userId = new ObjectId();
    const firstObserved = new Date("2026-11-08T08:00:00.000Z");
    const firstObservationId = new ObjectId();
    await hostGuestRsvpNoticeRepository.findOrCreate(userId);

    const seeded = await hostGuestRsvpNoticeRepository.stampNoticedAt(
      userId,
      { at: undefined, observationId: undefined },
      { at: firstObserved, observationId: firstObservationId },
    );
    expect(seeded).toBe(true);

    const nextObserved = new Date("2026-11-08T09:00:00.000Z");
    const nextObservationId = new ObjectId();
    const expected = { at: firstObserved, observationId: firstObservationId };
    const next = { at: nextObserved, observationId: nextObservationId };

    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        hostGuestRsvpNoticeRepository.stampNoticedAt(userId, expected, next),
      ),
    );
    const winners = results.filter(Boolean).length;
    expect(winners).toBe(1);

    const state = await hostGuestRsvpNoticeRepository.findOrCreate(userId);
    expect(state.noticedAt?.toISOString()).toBe(nextObserved.toISOString());
    expect(state.noticedObservationId?.toString()).toBe(
      nextObservationId.toString(),
    );
  });
});
