import { buildDemoSeedFixtures } from "@web/desktop/export-fixtures/demo-seed.fixtures";
import { buildGoToDateFixtures } from "@web/desktop/export-fixtures/go-to-date.fixtures";
import { buildNudgeFixtures } from "@web/desktop/export-fixtures/nudge.fixtures";
import { buildTimedDeckFixtures } from "@web/desktop/export-fixtures/timed-deck.fixtures";
import { describe, expect, it } from "bun:test";

describe("desktop export fixtures", () => {
  it("builds timed-deck vectors", () => {
    expect(buildTimedDeckFixtures().cases.length).toBeGreaterThan(0);
  });

  it("builds nudge vectors", () => {
    expect(buildNudgeFixtures().cases[0]?.output).not.toBeNull();
  });

  it("builds go-to-date vectors", () => {
    expect(buildGoToDateFixtures().cases.length).toBeGreaterThan(3);
  });

  it("builds demo seed snapshot", () => {
    const demo = buildDemoSeedFixtures();
    expect(demo.events).toHaveLength(18);
    expect(demo.referenceNow).toContain("2026-06-10");
  });
});
