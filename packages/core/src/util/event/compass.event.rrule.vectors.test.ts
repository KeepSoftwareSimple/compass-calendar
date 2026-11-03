import { buildRruleFixtures } from "@core/test/rrule.vectors";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MACOS_RRULE_FIXTURE_PATH = join(
  process.cwd(),
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Resources/Fixtures/rrule.vectors.json",
);

describe("CompassEventRRule desktop vectors", () => {
  it("matches the checked-in macOS rrule.vectors.json export", () => {
    const onDisk = JSON.parse(readFileSync(MACOS_RRULE_FIXTURE_PATH, "utf8"));
    expect(buildRruleFixtures()).toEqual(onDisk);
  });
});
