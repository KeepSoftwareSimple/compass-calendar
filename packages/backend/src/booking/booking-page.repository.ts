import { type ObjectId } from "mongodb";
import {
  type BookingPageRecord,
  BookingPageRecordSchema,
} from "@backend/booking/booking-page.record";
import mongoService from "@backend/common/services/mongo.service";

class BookingPageRepository {
  async findByUserId(userId: ObjectId): Promise<BookingPageRecord | null> {
    const record = await mongoService.bookingPage.findOne({ userId });
    if (!record) return null;
    return BookingPageRecordSchema.parse(record);
  }

  async findById(id: ObjectId): Promise<BookingPageRecord | null> {
    const record = await mongoService.bookingPage.findOne({ _id: id });
    if (!record) return null;
    return BookingPageRecordSchema.parse(record);
  }

  async findBySlug(slug: string): Promise<BookingPageRecord | null> {
    const record = await mongoService.bookingPage.findOne({
      bookingSlug: slug,
    });
    if (!record) return null;
    return BookingPageRecordSchema.parse(record);
  }

  async listTakenSlugs(): Promise<Set<string>> {
    const rows = await mongoService.bookingPage
      .find({ bookingSlug: { $exists: true } })
      .project({ bookingSlug: 1 })
      .toArray();
    return new Set(
      rows
        .map((row) => row["bookingSlug"])
        .filter((slug): slug is string => typeof slug === "string"),
    );
  }

  async isSlugTakenByOther(slug: string, userId: ObjectId): Promise<boolean> {
    const record = await mongoService.bookingPage.findOne({
      bookingSlug: slug,
    });
    if (!record) {
      return false;
    }
    return !record.userId.equals(userId);
  }

  async upsertByUserId(
    userId: ObjectId,
    fields: Omit<
      BookingPageRecord,
      "_id" | "userId" | "createdAt" | "updatedAt"
    > & { bookingSlug?: string },
  ): Promise<BookingPageRecord> {
    const now = new Date();
    const result = await mongoService.bookingPage.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...fields,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: mongoService.objectId(),
          userId,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw new Error("Failed to upsert booking page");
    }

    return BookingPageRecordSchema.parse(result);
  }

  /**
   * Stamp `hostNoticedAt` only when the document still matches the snapshot
   * the caller read, so concurrent claims cannot both report the same rows.
   */
  async stampHostNoticedAt(
    userId: ObjectId,
    expectedHostNoticedAt: Date | undefined,
    now: Date,
  ): Promise<boolean> {
    const filter =
      expectedHostNoticedAt === undefined
        ? { userId, hostNoticedAt: { $exists: false } }
        : { userId, hostNoticedAt: expectedHostNoticedAt };
    const result = await mongoService.bookingPage.findOneAndUpdate(
      filter,
      { $set: { hostNoticedAt: now } },
      { returnDocument: "after" },
    );
    return result !== null;
  }
}

export const bookingPageRepository = new BookingPageRepository();
