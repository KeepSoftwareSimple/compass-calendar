import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const SHARDS_PATH = ".github/macos-ui-shards.json";
const MACOS_WORKFLOW = ".github/workflows/test-macos.yml";
const UI_TESTS_DIR = "apps/calendar-macos/CompassUITests";

type StandaloneJob = {
  workflowJob: string;
  runScript: string;
  classes: string[];
};

type MacosUiShardsFile = {
  shards: Record<string, string[]>;
  standaloneJobs?: Record<string, StandaloneJob>;
};

function uiTestClasses(): string[] {
  return readdirSync(UI_TESTS_DIR)
    .filter((name) => name.endsWith("Tests.swift"))
    .map((name) => name.replace(/\.swift$/, ""))
    .sort();
}

function loadShardsFile(): MacosUiShardsFile {
  return JSON.parse(readFileSync(SHARDS_PATH, "utf8")) as MacosUiShardsFile;
}

function shardAssignedClasses(data: MacosUiShardsFile): string[] {
  return Object.values(data.shards).flat();
}

function standaloneAssignedClasses(data: MacosUiShardsFile): string[] {
  return Object.values(data.standaloneJobs ?? {}).flatMap((job) => job.classes);
}

describe("macOS UI shard assignment", () => {
  it("assigns every CompassUITests class to exactly one shard or standalone job", () => {
    const data = loadShardsFile();
    const shardLists = Object.values(data.shards);
    expect(shardLists.length).toBeGreaterThan(1);

    const fromShards = shardAssignedClasses(data);
    const fromStandalone = standaloneAssignedClasses(data);
    const assigned = [...fromShards, ...fromStandalone].sort();

    expect(new Set(fromShards).size).toBe(fromShards.length);
    expect(new Set(fromStandalone).size).toBe(fromStandalone.length);
    const overlap = fromShards.filter((name) => fromStandalone.includes(name));
    expect(overlap).toEqual([]);

    expect(assigned).toEqual(uiTestClasses());
  });

  it("wires each standalone job through workflow aggregate and run script", () => {
    const data = loadShardsFile();
    const workflow = readFileSync(MACOS_WORKFLOW, "utf8");

    for (const [key, job] of Object.entries(data.standaloneJobs ?? {})) {
      expect(job.workflowJob).toBe(key);
      expect(workflow).toMatch(new RegExp(`\\b${job.workflowJob}:`));
      expect(workflow).toContain(`needs.${job.workflowJob}.result`);
      expect(existsSync(job.runScript)).toBe(true);

      const script = readFileSync(job.runScript, "utf8");
      for (const className of job.classes) {
        expect(script).toContain(`-only-testing:CompassUITests/${className}`);
      }

      const onlyTestingMatches = [
        ...script.matchAll(/-only-testing:CompassUITests\/(\w+)/g),
      ].map((match) => match[1]);
      expect(onlyTestingMatches.sort()).toEqual([...job.classes].sort());
    }

    expect(workflow).toMatch(/macos:\s*\n\s*needs:.*macos-meeting-link-wide/s);
  });

  it("documents shard count in the workflow matrix", () => {
    const workflow = readFileSync(MACOS_WORKFLOW, "utf8");
    expect(workflow).toContain("macos-ui-shard");
    expect(workflow).toContain("MACOS_UI_SHARD:");
    expect(workflow).toContain("macos-ui-shard-test.sh");
  });

  it("includes UI test and app sources in the Xcode DerivedData cache key", () => {
    const workflow = readFileSync(MACOS_WORKFLOW, "utf8");
    expect(workflow).toContain("apps/calendar-macos/CompassUITests/**");
    expect(workflow).toContain("xcode-sparkle-v2");
  });

  it("regresses missing standalone registration when a dedicated wide script exists", () => {
    const scriptPath = ".github/scripts/macos-meeting-link-wide-ui-test.sh";
    const script = readFileSync(scriptPath, "utf8");
    const wideClass = script.match(
      /-only-testing:CompassUITests\/(EventFormMeetingLinkWideViewportTests)/,
    )?.[1];
    expect(wideClass).toBe("EventFormMeetingLinkWideViewportTests");

    const data = loadShardsFile();
    const registered = standaloneAssignedClasses(data);
    expect(registered).toContain(wideClass);
    expect(shardAssignedClasses(data)).not.toContain(wideClass);
  });
});
