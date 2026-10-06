import {
  emitProductEventNativeCoverageSwift,
  emitProductEventSwift,
  PRODUCT_EVENT_COVERAGE_SWIFT_PATH,
  PRODUCT_EVENT_SWIFT_PATH,
} from "@scripts/desktop-export/emit-product-event";
import {
  emitShortcutIdsSwift,
  emitShortcutsJson,
  shortcutsExportPaths,
} from "@scripts/desktop-export/emit-shortcuts";
import {
  emitThemeTokensSwift,
  THEME_TOKENS_SWIFT_PATH,
} from "@scripts/desktop-export/emit-theme-tokens";
import { emitBookingSetupStepsFixturesJson } from "@scripts/desktop-export/fixtures/booking-setup-steps.fixtures";
import { emitBookingSlotsFixturesJson } from "@scripts/desktop-export/fixtures/booking-slots.fixtures";
import { emitRruleFixturesJson } from "@scripts/desktop-export/fixtures/rrule.fixtures";
import {
  COMPASS_KIT_FIXTURES_DIR,
  INDEX_CSS_PATH,
} from "@scripts/desktop-export/paths";
import { runWebDesktopFixtures } from "@scripts/desktop-export/run-web-fixtures";
import {
  assertGeneratedFilesMatch,
  type GeneratedFile,
  writeGeneratedFiles,
} from "@scripts/desktop-export/write-check";
import { DESKTOP_WEB_FIXTURE_FILES } from "@core/desktop/desktop-web-fixture-files";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const buildWebFixtureFiles = async (): Promise<GeneratedFile[]> => {
  const tempDir = mkdtempSync(join(tmpdir(), "desktop-web-fixtures-"));
  await runWebDesktopFixtures(tempDir);
  const files = DESKTOP_WEB_FIXTURE_FILES.map((name) => ({
    path: join(COMPASS_KIT_FIXTURES_DIR, name),
    contents: readFileSync(join(tempDir, name), "utf8"),
  }));
  if (process.env["CI"] !== "true") {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return files;
};

const buildScriptGeneratedFiles = (): GeneratedFile[] => {
  const css = readFileSync(INDEX_CSS_PATH, "utf8");
  return [
    {
      path: shortcutsExportPaths.json,
      contents: emitShortcutsJson(),
    },
    {
      path: shortcutsExportPaths.swift,
      contents: emitShortcutIdsSwift(),
    },
    {
      path: THEME_TOKENS_SWIFT_PATH,
      contents: emitThemeTokensSwift(css),
    },
    {
      path: PRODUCT_EVENT_SWIFT_PATH,
      contents: emitProductEventSwift(),
    },
    {
      path: PRODUCT_EVENT_COVERAGE_SWIFT_PATH,
      contents: emitProductEventNativeCoverageSwift(),
    },
    {
      path: join(COMPASS_KIT_FIXTURES_DIR, "rrule.vectors.json"),
      contents: emitRruleFixturesJson(),
    },
    {
      path: join(COMPASS_KIT_FIXTURES_DIR, "booking-slots.vectors.json"),
      contents: emitBookingSlotsFixturesJson(),
    },
    {
      path: join(COMPASS_KIT_FIXTURES_DIR, "booking-setup-steps.vectors.json"),
      contents: emitBookingSetupStepsFixturesJson(),
    },
  ];
};

export const runDesktopExport = async (check: boolean): Promise<void> => {
  const files = [
    ...buildScriptGeneratedFiles(),
    ...(await buildWebFixtureFiles()),
  ];
  if (check) {
    assertGeneratedFilesMatch(files, "desktop:export");
    console.log("desktop:export --check OK");
    return;
  }
  writeGeneratedFiles(buildScriptGeneratedFiles());
  await runWebDesktopFixtures(COMPASS_KIT_FIXTURES_DIR);
  console.log("Wrote desktop export artifacts");
};
