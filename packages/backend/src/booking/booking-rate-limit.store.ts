import { type Options, type Store } from "express-rate-limit";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { isDuplicateKeyError } from "@core/util/mongo-duplicate-key.util";
import mongoService from "@backend/common/services/mongo.service";
import { createHash } from "node:crypto";

const logger = Logger("app:booking.rate-limit");

const hashKey = (prefix: string, key: string): string =>
  createHash("sha256").update(`${prefix}\0${key}`).digest("hex");

/**
 * Mongo-backed express-rate-limit store. Each limiter gets its own instance
 * (the library forbids sharing one Store object), but they share this
 * collection, so two app replicas enforce one budget.
 *
 * Fail-closed: store errors propagate to the limiter (`passOnStoreError:
 * false`) and become 503, not a free pass.
 */
export const createBookingRateLimitStore = (prefix: string): Store => {
  let windowMs = 60_000;

  const collection = () => mongoService.bookingRateLimit;

  const incrementOnce = async (
    id: string,
  ): Promise<{
    totalHits: number;
    resetTime: Date;
  }> => {
    const now = new Date();
    const freshExpiry = new Date(now.getTime() + windowMs);
    const current = await collection().findOneAndUpdate(
      { _id: id, expiresAt: { $gt: now } },
      { $inc: { hits: 1 } },
      { returnDocument: "after" },
    );
    if (current) {
      return { totalHits: current.hits, resetTime: current.expiresAt };
    }

    try {
      await collection().insertOne({
        _id: id,
        hits: 1,
        expiresAt: freshExpiry,
      });
      return { totalHits: 1, resetTime: freshExpiry };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      const raced = await collection().findOneAndUpdate(
        { _id: id, expiresAt: { $gt: new Date() } },
        { $inc: { hits: 1 } },
        { returnDocument: "after" },
      );
      if (raced) {
        return { totalHits: raced.hits, resetTime: raced.expiresAt };
      }
      await collection().replaceOne(
        { _id: id },
        { hits: 1, expiresAt: freshExpiry },
      );
      return { totalHits: 1, resetTime: freshExpiry };
    }
  };

  return {
    localKeys: false,
    prefix,
    init(options: Options) {
      windowMs = options.windowMs;
    },
    async increment(key: string) {
      const id = hashKey(prefix, key);
      try {
        return await incrementOnce(id);
      } catch {
        logger.warn("Booking rate-limit store increment failed", {
          limiter: prefix,
        });
        throw new BaseError(
          "RATE_LIMIT_UNAVAILABLE",
          "Booking is temporarily unavailable. Try again shortly.",
          Status.SERVICE_UNAVAILABLE,
          true,
          "RATE_LIMIT_UNAVAILABLE",
        );
      }
    },
    async decrement(key: string) {
      const id = hashKey(prefix, key);
      await collection().updateOne(
        { _id: id, hits: { $gt: 0 } },
        { $inc: { hits: -1 } },
      );
    },
    async resetKey(key: string) {
      await collection().deleteOne({ _id: hashKey(prefix, key) });
    },
  };
};
