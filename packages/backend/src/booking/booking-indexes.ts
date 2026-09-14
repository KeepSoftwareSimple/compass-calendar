import mongoService from "@backend/common/services/mongo.service";

export async function ensureBookingIndexes(): Promise<void> {
  await mongoService.bookingPage.createIndex(
    { userId: 1 },
    { name: "booking_page_user_id_unique", unique: true },
  );
  await mongoService.bookingPage.createIndex(
    { bookingSlug: 1 },
    {
      name: "booking_page_slug_unique",
      unique: true,
      sparse: true,
    },
  );

  await mongoService.bookingReservation.createIndex(
    { pageId: 1, slotStart: 1 },
    {
      name: "booking_reservation_page_slot_confirmed_unique",
      unique: true,
      partialFilterExpression: { status: "confirmed" },
    },
  );
  // Windowed confirmed scans (`status` + `slotStart` range) can use this
  // compound or the unique sibling above. The unique index is partial on
  // `status: "confirmed"`: Atlas will not consider it unless the query
  // states that predicate. Always include `status: "confirmed"`.
  await mongoService.bookingReservation.createIndex(
    { pageId: 1, status: 1, slotStart: 1 },
    { name: "booking_reservation_page_status_slot" },
  );
  await mongoService.bookingReservation.createIndex(
    { pageId: 1, status: 1, createdAt: 1, _id: 1 },
    { name: "booking_reservation_page_status_created" },
  );
}
