import { bookingOperationBackoffMs } from "@backend/booking/booking-operation.constants";
import { describe, expect, it } from "bun:test";

describe("bookingOperationBackoffMs", () => {
  it("grows then caps", () => {
    expect(bookingOperationBackoffMs(0)).toBe(2_000);
    expect(bookingOperationBackoffMs(1)).toBe(4_000);
    expect(bookingOperationBackoffMs(8)).toBe(5 * 60 * 1000);
    expect(bookingOperationBackoffMs(20)).toBe(5 * 60 * 1000);
  });
});
