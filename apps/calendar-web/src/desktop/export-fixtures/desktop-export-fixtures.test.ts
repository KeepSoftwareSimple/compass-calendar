import { describe, expect, it } from "bun:test";

const bootExportFixtures = async () => {
  const { ensureDesktopExportEnv } = await import(
    "@core/desktop/desktop-export-env"
  );
  ensureDesktopExportEnv();
  return import("@web/desktop/export-fixtures/demo-seed.fixtures");
};

describe("desktop export fixtures", () => {
  it("builds timed-deck vectors", async () => {
    const { ensureDesktopExportEnv } = await import(
      "@core/desktop/desktop-export-env"
    );
    ensureDesktopExportEnv();
    const { buildTimedDeckFixtures } = await import(
      "@web/desktop/export-fixtures/timed-deck.fixtures"
    );
    expect(buildTimedDeckFixtures().cases.length).toBeGreaterThan(0);
  });

  it("builds nudge vectors", async () => {
    const { ensureDesktopExportEnv } = await import(
      "@core/desktop/desktop-export-env"
    );
    ensureDesktopExportEnv();
    const { buildNudgeFixtures } = await import(
      "@web/desktop/export-fixtures/nudge.fixtures"
    );
    expect(buildNudgeFixtures().cases[0]?.output).not.toBeNull();
  });

  it("builds go-to-date vectors", async () => {
    const { buildGoToDateFixtures } = await import(
      "@web/desktop/export-fixtures/go-to-date.fixtures"
    );
    expect(buildGoToDateFixtures().cases.length).toBeGreaterThan(3);
  });

  it("builds grid-layout snapshots without duplicating input", async () => {
    const { ensureDesktopExportEnv } = await import(
      "@core/desktop/desktop-export-env"
    );
    ensureDesktopExportEnv();
    const { buildGridLayoutSnapshotFixtures } = await import(
      "@web/desktop/export-fixtures/grid-layout.snapshot.fixtures"
    );
    const { scenarios } = buildGridLayoutSnapshotFixtures();
    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "grid-layout-1day",
      "grid-layout-3day",
      "grid-layout-7day",
      "grid-layout-day-mode",
    ]);
    expect(scenarios[0]?.output.visibleDayCount).toBe(1);
    expect(scenarios[1]?.output.visibleDayCount).toBe(3);
    expect(scenarios[2]?.output.visibleDayCount).toBe(7);
    expect(scenarios[3]?.output.layoutMode).toBe("day");
  });

  it("builds html-fragment vectors", async () => {
    const { buildHtmlFragmentFixtures } = await import(
      "@web/desktop/export-fixtures/html-fragment.fixtures"
    );
    expect(buildHtmlFragmentFixtures().cases.length).toBeGreaterThan(5);
  });

  it("builds block party task vectors", async () => {
    const { buildBlockPartyFixtures } = await import(
      "@web/desktop/export-fixtures/block-party.fixtures"
    );
    const fixtures = buildBlockPartyFixtures();
    expect(fixtures.runTasks).toHaveLength(11);
    expect(fixtures.cases.length).toBeGreaterThan(11);
    expect(fixtures.cases.some((c) => c.id === "winning-script")).toBe(true);
  });

  it("builds demo seed snapshot", async () => {
    await bootExportFixtures();
    const { buildDemoSeedFixtures, DEMO_EXPORT_CALENDAR_ID } = await import(
      "@web/desktop/export-fixtures/demo-seed.fixtures"
    );
    const demo = buildDemoSeedFixtures();
    expect(demo.events).toHaveLength(22);
    expect(demo.referenceNow).toContain("2026-06-10");
    expect(demo.calendarId).toBe(DEMO_EXPORT_CALENDAR_ID);
  });
});
