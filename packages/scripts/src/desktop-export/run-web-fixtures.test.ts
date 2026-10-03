import { ensureDesktopExportEnv } from "@scripts/desktop-export/ensure-export-env";
import { runWebDesktopFixtures } from "@scripts/desktop-export/run-web-fixtures";
import { DESKTOP_WEB_FIXTURE_FILES } from "@core/desktop/desktop-web-fixture-files";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("run-web-fixtures", () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("writes parity fixture JSON from the web exporters", async () => {
    ensureDesktopExportEnv();
    tempDir = mkdtempSync(join(tmpdir(), "desktop-web-fixtures-test-"));
    await runWebDesktopFixtures(tempDir);

    for (const name of DESKTOP_WEB_FIXTURE_FILES) {
      const raw = readFileSync(join(tempDir, name), "utf8");
      const parsed = JSON.parse(raw) as unknown;
      expect(raw.length).toBeGreaterThan(10);
      expect(parsed).toBeTruthy();
    }

    const nudge = JSON.parse(
      readFileSync(join(tempDir, "nudge.vectors.json"), "utf8"),
    ) as { cases: unknown[] };
    expect(nudge.cases.length).toBeGreaterThan(0);

    const goToDate = JSON.parse(
      readFileSync(join(tempDir, "go-to-date.vectors.json"), "utf8"),
    ) as { cases: unknown[] };
    expect(goToDate.cases.length).toBeGreaterThan(3);

    const demoSeed = JSON.parse(
      readFileSync(join(tempDir, "demo-seed.json"), "utf8"),
    ) as { events: unknown[]; referenceNow: string };
    expect(demoSeed.events).toHaveLength(18);
    expect(demoSeed.referenceNow).toContain("2026-06-10");

    const timedDeck = JSON.parse(
      readFileSync(join(tempDir, "timed-deck.vectors.json"), "utf8"),
    ) as { cases: unknown[] };
    expect(timedDeck.cases.length).toBeGreaterThan(0);
  });
});
