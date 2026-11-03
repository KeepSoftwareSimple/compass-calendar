import { confirmedReservationScanRange } from "@backend/booking/booking-reservation.repository";
import { describe, expect, it } from "bun:test";

describe("confirmedReservationScanRange", () => {
  it("covers reservations that could overlap the window start", () => {
    const range = confirmedReservationScanRange(
      new Date("2026-09-07T09:30:00.000Z"),
      new Date("2026-09-07T11:00:00.000Z"),
    );

    expect(range.from.toISOString()).toBe("2026-09-07T08:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-09-07T11:00:00.000Z");
  });

  it("extends the longest meeting length before the window", () => {
    const range = confirmedReservationScanRange(
      new Date("2026-09-07T23:00:00.000Z"),
      new Date("2026-09-07T23:30:00.000Z"),
    );

    expect(range.from.toISOString()).toBe("2026-09-07T22:00:00.000Z");
    expect(range.to.toISOString()).toBe("2026-09-07T23:30:00.000Z");
  });
});
