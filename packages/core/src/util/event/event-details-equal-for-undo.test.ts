import { eventDetailsEqualForUndo } from "@core/util/event/event-details-equal-for-undo";
import { describe, expect, it } from "bun:test";

const details = (
  overrides: Partial<{
    title: string;
    color: string | null;
    colorHex: string;
  }> = {},
) => ({
  kind: "details" as const,
  title: "Meet",
  description: "",
  location: "",
  ...overrides,
});

describe("eventDetailsEqualForUndo", () => {
  it("ignores colorHex drift when the Compass color slot matches", () => {
    expect(
      eventDetailsEqualForUndo(
        details({ color: "blue", colorHex: "#039BE5" }),
        details({ color: "blue" }),
      ),
    ).toBe(true);
  });

  it("detects a real color slot change", () => {
    expect(
      eventDetailsEqualForUndo(
        details({ color: "blue" }),
        details({ color: "coral" }),
      ),
    ).toBe(false);
  });
});
