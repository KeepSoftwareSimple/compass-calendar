import { describe, expect, it } from "bun:test";

const bootExportFixtures = async () => {
  const { ensureDesktopExportEnv } = await import(
    "@web/desktop/export-fixtures/ensure-export-env"
  );
  ensureDesktopExportEnv();
  return import("@web/desktop/export-fixtures/demo-seed.fixtures");
};

describe("desktop export fixtures", () => {
  it("builds timed-deck vectors", async () => {
    const { ensureDesktopExportEnv } = await import(
      "@web/desktop/export-fixtures/ensure-export-env"
    );
    ensureDesktopExportEnv();
    const { buildTimedDeckFixtures } = await import(
      "@web/desktop/export-fixtures/timed-deck.fixtures"
    );
    expect(buildTimedDeckFixtures().cases.length).toBeGreaterThan(0);
  });

  it("builds nudge vectors", async () => {
    const { ensureDesktopExportEnv } = await import(
      "@web/desktop/export-fixtures/ensure-export-env"
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

  it("builds demo seed snapshot", async () => {
    await bootExportFixtures();
    const { buildDemoSeedFixtures, DEMO_EXPORT_CALENDAR_ID } = await import(
      "@web/desktop/export-fixtures/demo-seed.fixtures"
    );
    const demo = buildDemoSeedFixtures();
    expect(demo.events).toHaveLength(18);
    expect(demo.referenceNow).toContain("2026-06-10");
    expect(demo.calendarId).toBe(DEMO_EXPORT_CALENDAR_ID);
  });
});
