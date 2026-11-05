import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const SHARDS_PATH = ".github/macos-ui-shards.json";
const UI_TESTS_DIR = "apps/calendar-macos/CompassUITests";

function uiTestClasses(): string[] {
  return readdirSync(UI_TESTS_DIR)
    .filter((name) => name.endsWith("Tests.swift"))
    .map((name) => name.replace(/\.swift$/, ""))
    .sort();
}

describe("macOS UI shard assignment", () => {
  it("assigns every CompassUITests class to exactly one shard", () => {
    const data = JSON.parse(readFileSync(SHARDS_PATH, "utf8")) as {
      shards: Record<string, string[]>;
    };
    const lists = Object.values(data.shards);
    expect(lists.length).toBeGreaterThan(1);

    const assigned = lists.flat().sort();
    expect(assigned).toEqual(uiTestClasses());
  });

  it("documents shard count in the workflow matrix", () => {
    const workflow = readFileSync(".github/workflows/test-macos.yml", "utf8");
    expect(workflow).toContain("macos-ui-shard");
    expect(workflow).toContain("MACOS_UI_SHARD:");
    expect(workflow).toContain("macos-ui-shard-test.sh");
  });
});
