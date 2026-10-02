import { buildRruleFixtures } from "@scripts/desktop-export/fixtures/rrule.fixtures";
import { describe, expect, it } from "bun:test";

describe("rrule export fixtures", () => {
  it("includes summary text and instance instants", () => {
    const fixtures = buildRruleFixtures();
    expect(fixtures.cases[0]?.output.summary).toContain("RRULE");
    expect(fixtures.cases[0]?.output.instances.length).toBeGreaterThan(0);
  });
});
