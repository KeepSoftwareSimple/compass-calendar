import { buildBookingSlotsFixtures } from "@scripts/desktop-export/fixtures/booking-slots.fixtures";
import { describe, expect, it } from "bun:test";

describe("booking-slots fixtures", () => {
  it("includes the mon-wed grid baseline", () => {
    const vector = buildBookingSlotsFixtures().cases.find(
      (entry) => entry.id === "mon-wed-grid",
    );
    expect(vector?.output.slots.length).toBeGreaterThan(0);
  });
});
