import { BOOKING_FIELDS } from "@web/booking/booking-sequence.fields";
import { describe, expect, test } from "bun:test";

describe("BOOKING_FIELDS", () => {
  test("keeps a unique id for every save-error anchor", () => {
    expect(new Set(BOOKING_FIELDS).size).toBe(BOOKING_FIELDS.length);
  });
});
