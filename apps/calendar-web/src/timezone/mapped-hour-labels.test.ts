import { mappedHourLabels } from "@web/timezone/mapped-hour-labels";
import { describe, expect, it } from "bun:test";

describe("mappedHourLabels", () => {
  it("lists 1 AM through 11 PM when both zones are the same", () => {
    const labels = mappedHourLabels(
      "America/Denver",
      "America/Denver",
      "2026-08-20",
    );
    expect(labels).toHaveLength(23);
    expect(labels[0]).toBe("1 AM");
    expect(labels[22]).toBe("11 PM");
  });

  it("shifts Denver two hours behind New York", () => {
    const labels = mappedHourLabels(
      "America/New_York",
      "America/Denver",
      "2026-08-20",
    );

    expect(labels[0]).toBe("11 PM");
    expect(labels[8]).toBe("7 AM");
    expect(labels[12]).toBe("11 AM");
  });

  it("uses the per-instant offset when DST differs between zones", () => {
    // 2026-03-15: US already on EDT, UK still on GMT (5h vs the later 4h BST gap).
    const march = mappedHourLabels(
      "America/New_York",
      "Europe/London",
      "2026-03-15",
    );
    // 2026-04-15: both on summer time (EDT / BST).
    const april = mappedHourLabels(
      "America/New_York",
      "Europe/London",
      "2026-04-15",
    );

    expect(march[0]).toBe("5 AM");
    expect(april[0]).toBe("6 AM");
    expect(march[0]).not.toBe(april[0]);
  });
});
