import { DESKTOP_WEB_FIXTURE_FILES } from "@core/desktop/desktop-web-fixture-files";
import { emitDemoSeedFixturesJson } from "@web/desktop/export-fixtures/demo-seed.fixtures";
import { emitGoToDateFixturesJson } from "@web/desktop/export-fixtures/go-to-date.fixtures";
import { emitGridLayoutSnapshotFixturesJson } from "@web/desktop/export-fixtures/grid-layout.snapshot.fixtures";
import { emitHtmlFragmentFixturesJson } from "@web/desktop/export-fixtures/html-fragment.fixtures";
import { emitLifeGridSnapshotFixturesJson } from "@web/desktop/export-fixtures/life-grid.snapshot.fixtures";
import { emitNudgeFixturesJson } from "@web/desktop/export-fixtures/nudge.fixtures";
import { emitTimedDeckFixturesJson } from "@web/desktop/export-fixtures/timed-deck.fixtures";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outputDir =
  process.argv[2] ??
  join(
    process.cwd(),
    "apps/calendar-macos/CompassKit/Sources/CompassKit/Resources/Fixtures",
  );

const emitters: Record<
  (typeof DESKTOP_WEB_FIXTURE_FILES)[number],
  () => string
> = {
  "timed-deck.vectors.json": emitTimedDeckFixturesJson,
  "nudge.vectors.json": emitNudgeFixturesJson,
  "go-to-date.vectors.json": emitGoToDateFixturesJson,
  "html-fragment.vectors.json": emitHtmlFragmentFixturesJson,
  "demo-seed.json": emitDemoSeedFixturesJson,
  "grid-layout.snapshots.json": emitGridLayoutSnapshotFixturesJson,
  "life-grid.snapshots.json": emitLifeGridSnapshotFixturesJson,
};

const files: Record<string, string> = Object.fromEntries(
  DESKTOP_WEB_FIXTURE_FILES.map((name) => [name, emitters[name]()]),
);

mkdirSync(outputDir, { recursive: true });
for (const [name, contents] of Object.entries(files)) {
  writeFileSync(join(outputDir, name), contents, "utf8");
}
