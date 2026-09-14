import { type Options } from "express-rate-limit";
import { Status } from "@core/errors/status.codes";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { ensureBookingIndexes } from "@backend/booking/booking-indexes";
import { createBookingRateLimitStore } from "@backend/booking/booking-rate-limit.store";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";

const initStore = (prefix: string, windowMs = 60_000) => {
  const store = createBookingRateLimitStore(prefix);
  store.init?.({ windowMs } as Options);
  return store;
};

describe("createBookingRateLimitStore", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
    await ensureBookingIndexes();
  });

  beforeEach(cleanupCollections);

  afterAll(cleanupTestDb);

  it("counts hits from two store instances toward one budget", async () => {
    const replicaA = initStore("booking:confirm");
    const replicaB = initStore("booking:confirm");

    for (let index = 0; index < 6; index += 1) {
      await replicaA.increment("203.0.113.9:host-slug");
    }
    let hits = 6;
    for (let index = 0; index < 5; index += 1) {
      hits = (await replicaB.increment("203.0.113.9:host-slug")).totalHits;
    }

    expect(hits).toBe(11);
    expect((await replicaA.increment("198.51.100.2:host-slug")).totalHits).toBe(
      1,
    );
  });

  it("starts a new window after expiry", async () => {
    const store = initStore("booking:expiry", 40);
    expect((await store.increment("caller")).totalHits).toBe(1);
    await Bun.sleep(50);
    expect((await store.increment("caller")).totalHits).toBe(1);
  });

  it("does not store raw IPs, slugs, or reservation ids", async () => {
    const store = initStore("booking:privacy");
    await store.increment(
      "203.0.113.9:507f1f77bcf86cd799439011?token=sentinel-capability-token-9f3c",
    );
    const rows = await mongoService.bookingRateLimit.find().toArray();
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain("203.0.113.9");
    expect(serialized).not.toContain("507f1f77bcf86cd799439011");
    expect(serialized).not.toContain("sentinel-capability-token-9f3c");
  });

  it("fails closed with 503 when Mongo cannot increment", async () => {
    const store = initStore("booking:down");
    const increment = spyOn(
      mongoService.bookingRateLimit,
      "findOneAndUpdate",
    ).mockImplementation(async () => {
      throw new Error("socket hang up");
    });

    try {
      await expect(store.increment("caller")).rejects.toMatchObject({
        statusCode: Status.SERVICE_UNAVAILABLE,
        result: "RATE_LIMIT_UNAVAILABLE",
      });
    } finally {
      increment.mockRestore();
    }
  });
});
