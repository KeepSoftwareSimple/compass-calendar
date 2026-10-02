import { emitDemoSeedFixturesJson } from "@web/desktop/export-fixtures/demo-seed.fixtures";
import { emitGoToDateFixturesJson } from "@web/desktop/export-fixtures/go-to-date.fixtures";
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

const files: Record<string, string> = {
  "timed-deck.vectors.json": emitTimedDeckFixturesJson(),
  "nudge.vectors.json": emitNudgeFixturesJson(),
  "go-to-date.vectors.json": emitGoToDateFixturesJson(),
  "demo-seed.json": emitDemoSeedFixturesJson(),
};

mkdirSync(outputDir, { recursive: true });
for (const [name, contents] of Object.entries(files)) {
  writeFileSync(join(outputDir, name), contents, "utf8");
}
