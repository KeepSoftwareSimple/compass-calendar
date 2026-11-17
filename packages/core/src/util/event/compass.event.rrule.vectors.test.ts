import { buildRruleFixtures } from "@core/test/rrule.vectors";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RRULE_FIXTURE_PATH = join(
  process.cwd(),
  "packages/core/src/test/fixtures/rrule.vectors.json",
);

describe("CompassEventRRule desktop vectors", () => {
  it("matches the checked-in shared rrule.vectors.json export", () => {
    const onDisk = JSON.parse(readFileSync(RRULE_FIXTURE_PATH, "utf8"));
    expect(buildRruleFixtures()).toEqual(onDisk);
  });
});
