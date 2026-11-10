import { type DateTime, EventIdSchema } from "@core/types/domain-primitives";
import { remainderMasterId } from "@core/util/series-split";
import { describe, expect, it } from "bun:test";

describe("remainderMasterId", () => {
  it("is deterministic for the same split point", () => {
    const seriesId = EventIdSchema.parse("65b80e635088efa5d8477a66");
    const splitAt = "2026-11-12T00:00:00.000Z" as DateTime;
    expect(remainderMasterId(seriesId, splitAt)).toBe(
      remainderMasterId(seriesId, splitAt),
    );
    expect(remainderMasterId(seriesId, splitAt)).toHaveLength(24);
  });
});
