import {
  type BaselineDeps,
  classifyFailures,
  type Failure,
  parseBunTestFailures,
  parsePlaywrightFailures,
  runBaseline,
} from "@scripts/testing/verify-baseline";
import { describe, expect, it } from "bun:test";

const PW_TWO_FAILED = `
  1) [chromium-desktop] › e2e/a.spec.ts:10:5 › suite › breaks ────────
    Error: expect(locator).toBeVisible() failed

  2 failed
    [chromium-desktop] › e2e/a.spec.ts:10:5 › suite › breaks ───────────
    [chromium-desktop] › e2e/b.spec.ts:3:1 › also breaks ────────────────
  1 flaky
    [chromium-desktop] › e2e/c.spec.ts:8:1 › wobbles ────────────────────
  40 passed (1.2m)
`;

const BUN_TWO_FAILED = `
apps/calendar-web/src/a.test.ts:
error: expect(received).toBe(expected)
(fail) grp > breaks [7.35ms]
apps/calendar-web/src/b.test.tsx:
(fail) top level [1.61ms]

 5 pass
 2 fail
Ran 7 tests across 2 files. [1.50s]
`;

function failure(key: string, file = "e2e/a.spec.ts"): Failure {
  return { file, key };
}

describe("parsePlaywrightFailures", () => {
  it("lists failed tests from the summary without line numbers", () => {
    expect(parsePlaywrightFailures(PW_TWO_FAILED)).toEqual([
      {
        file: "e2e/a.spec.ts",
        key: "[chromium-desktop] › e2e/a.spec.ts › suite › breaks",
      },
      {
        file: "e2e/b.spec.ts",
        key: "[chromium-desktop] › e2e/b.spec.ts › also breaks",
      },
    ]);
  });

  it("prefixes e2e/ when paths are relative to the test dir", () => {
    const output = "  1 failed\n    [chromium-desktop] › a.spec.ts:1:1 › x\n";
    expect(parsePlaywrightFailures(output)?.[0]?.file).toBe("e2e/a.spec.ts");
  });

  it("refuses output whose list does not match the failed count", () => {
    const output = "  2 failed\n    [chromium-desktop] › a.spec.ts:1:1 › x\n";
    expect(parsePlaywrightFailures(output)).toBeNull();
  });

  it("refuses errors outside any test", () => {
    expect(
      parsePlaywrightFailures(
        `${PW_TWO_FAILED}\n  1 error was not a part of any test, see above for details`,
      ),
    ).toBeNull();
  });
});

describe("parseBunTestFailures", () => {
  it("attributes each (fail) line to its file header", () => {
    expect(parseBunTestFailures(BUN_TWO_FAILED)).toEqual([
      {
        file: "apps/calendar-web/src/a.test.ts",
        key: "apps/calendar-web/src/a.test.ts > grp > breaks",
      },
      {
        file: "apps/calendar-web/src/b.test.tsx",
        key: "apps/calendar-web/src/b.test.tsx > top level",
      },
    ]);
  });

  it("sums fail counts across shards and ignores the recap", () => {
    const shards = `${BUN_TWO_FAILED}\n2 tests failed:\n(fail) grp > breaks\n(fail) top level\n${BUN_TWO_FAILED}`;
    expect(parseBunTestFailures(shards)).toHaveLength(4);
  });

  it("refuses unhandled errors between tests", () => {
    expect(parseBunTestFailures(`${BUN_TWO_FAILED} 1 error\n`)).toBeNull();
  });

  it("refuses output with no counted failures", () => {
    expect(parseBunTestFailures("error: script exited with code 1")).toBeNull();
  });
});

describe("classifyFailures", () => {
  const brokenOnBoth = failure("both");
  const brokenHere = failure("here");
  const wobbly = failure("wobbly");

  it("separates new, pre-existing, and flaky failures", () => {
    expect(
      classifyFailures({
        initial: [brokenOnBoth, brokenHere, wobbly],
        branchRerun: [brokenOnBoth, brokenHere],
        mainRerun: [brokenOnBoth],
      }),
    ).toEqual({
      newFailures: [brokenHere],
      preExisting: [brokenOnBoth],
      flaky: [wobbly],
    });
  });

  it("counts a test missing on main as new", () => {
    expect(
      classifyFailures({
        initial: [brokenHere],
        branchRerun: [brokenHere],
        mainRerun: [],
      }).newFailures,
    ).toEqual([brokenHere]);
  });

  it("reports a test once when it failed in two projects' passes", () => {
    expect(
      classifyFailures({
        initial: [brokenOnBoth, brokenOnBoth],
        branchRerun: [brokenOnBoth],
        mainRerun: [brokenOnBoth],
      }).preExisting,
    ).toHaveLength(1);
  });
});

function baselineDeps(results: {
  branch: { exitCode: number; output: string };
  main?: { exitCode: number; output: string };
  install?: number;
}): BaselineDeps & { calls: string[]; removed: string[] } {
  const calls: string[] = [];
  const removed: string[] = [];
  return {
    calls,
    removed,
    async run(_checkId, cmd, cwd) {
      calls.push(`${cwd ?? "."}: ${cmd.join(" ")}`);
      if (cmd[1] === "install") {
        return { exitCode: results.install ?? 0, output: "" };
      }
      if (cwd) return results.main ?? { exitCode: 0, output: "" };
      return results.branch;
    },
    addWorktree: () => "/tmp/main",
    removeWorktree: (dir) => removed.push(dir),
    log: () => {},
  };
}

describe("runBaseline", () => {
  it("clears a check whose failures also fail on main, and removes the worktree", async () => {
    const deps = baselineDeps({
      branch: { exitCode: 1, output: PW_TWO_FAILED },
      main: { exitCode: 1, output: PW_TWO_FAILED },
    });
    const outcome = await runBaseline(deps, "origin/main", [
      { checkId: "test:e2e", output: PW_TWO_FAILED },
    ]);
    expect(outcome.cleared).toEqual(["test:e2e"]);
    expect(outcome.report).toContain("PRE-EXISTING, fails on main too (2):");
    expect(deps.calls).toEqual([
      ".: bunx playwright test e2e/a.spec.ts e2e/b.spec.ts",
      "/tmp/main: bun install --frozen-lockfile",
      "/tmp/main: bunx playwright test e2e/a.spec.ts e2e/b.spec.ts",
    ]);
    expect(deps.removed).toEqual(["/tmp/main"]);
  });

  it("keeps a check failed when a failure passes on main", async () => {
    const outcome = await runBaseline(
      baselineDeps({
        branch: { exitCode: 1, output: PW_TWO_FAILED },
        main: { exitCode: 0, output: "" },
      }),
      "origin/main",
      [{ checkId: "test:e2e", output: PW_TWO_FAILED }],
    );
    expect(outcome.cleared).toEqual([]);
    expect(outcome.report).toContain("NEW, fails only on this branch (2):");
  });

  it("skips the worktree when every failure passes on the branch rerun", async () => {
    const deps = baselineDeps({ branch: { exitCode: 0, output: "" } });
    const outcome = await runBaseline(deps, "origin/main", [
      { checkId: "test:web", output: BUN_TWO_FAILED },
    ]);
    expect(outcome.cleared).toEqual(["test:web"]);
    expect(outcome.report).toContain("FLAKY, passed on rerun (2):");
    expect(deps.calls).toEqual([
      ".: bun run test:web -- apps/calendar-web/src/a.test.ts apps/calendar-web/src/b.test.tsx",
    ]);
  });

  it("keeps a check failed when its output cannot be parsed", async () => {
    const outcome = await runBaseline(
      baselineDeps({ branch: { exitCode: 1, output: "" } }),
      "origin/main",
      [{ checkId: "test:e2e", output: "webServer failed to start" }],
    );
    expect(outcome.cleared).toEqual([]);
  });

  it("keeps checks failed when the main worktree cannot install", async () => {
    const deps = baselineDeps({
      branch: { exitCode: 1, output: PW_TWO_FAILED },
      install: 1,
    });
    const outcome = await runBaseline(deps, "origin/main", [
      { checkId: "test:e2e", output: PW_TWO_FAILED },
    ]);
    expect(outcome.cleared).toEqual([]);
    expect(deps.removed).toEqual(["/tmp/main"]);
  });
});
