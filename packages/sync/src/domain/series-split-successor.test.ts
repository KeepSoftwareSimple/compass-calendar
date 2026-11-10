import { type DateTime } from "@core/types/domain-primitives";
import { remainderMasterId } from "@core/util/series-split";
import {
  splitInstantAfterTruncation,
  truncateRulesBefore,
} from "@sync/domain/occurrence-projection";
import { describe, expect, it } from "bun:test";

describe("splitInstantAfterTruncation", () => {
  it("returns one second after an inclusive UNTIL bound", () => {
    const rules = truncateRulesBefore(
      ["RRULE:FREQ=WEEKLY;COUNT=5"],
      new Date("2026-11-12T00:00:00.000Z"),
    );
    const split = splitInstantAfterTruncation(rules);
    expect(split?.toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });
});

describe("remainderMasterId chain", () => {
  it("matches sync split semantics for Tyler's Unwind sequence", () => {
    const original = "65b80e635088efa5d8477a66" as const;
    const splitAt = "2026-11-12T00:00:00.000Z" as DateTime;
    const remainder = remainderMasterId(original, splitAt);
    expect(remainder).not.toBe(original);
  });
});
