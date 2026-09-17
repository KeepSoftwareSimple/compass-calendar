import {
  chromiumInstallLocationFromDryRun,
  collectChangedFiles,
  type GitCommands,
  mapFilesToPackages,
  PLAYWRIGHT_INSTALL_COMMAND,
  planVerify,
  resolveMergeBase,
  runVerify,
  type SpawnFn,
  type SpawnResult,
  selectPackageTestCheck,
} from "@scripts/testing/verify";
import { describe, expect, it } from "bun:test";

function gitStub(options: {
  refs?: string[];
  mergeBases?: Record<string, string>;
  diffs?: Record<string, string[]>;
  untracked?: string[];
  fetch?: () => void;
}): GitCommands {
  const refs = new Set(options.refs ?? ["origin/main", "main"]);
  const mergeBases = options.mergeBases ?? { "HEAD:origin/main": "abc123" };
  const diffs = options.diffs ?? {};
  return {
    hasRef: (ref) => refs.has(ref),
    fetch: () => {
      refs.add("origin/main");
      options.fetch?.();
    },
    mergeBase: (a, b) => mergeBases[`${a}:${b}`] ?? null,
    diffNameOnly: (args) => {
      const key = args.join(" ");
      return diffs[key] ?? [];
    },
    untrackedNames: () => options.untracked ?? [],
  };
}

function recordingSpawn(options?: {
  results?: Record<string, SpawnResult>;
  delays?: Record<string, number>;
  onStart?: (cmd: string[]) => void;
  onEnd?: (cmd: string[]) => void;
}): {
  spawn: SpawnFn;
  commands: string[][];
} {
  const commands: string[][] = [];
  const spawn: SpawnFn = (cmd) => {
    commands.push(cmd);
    options?.onStart?.(cmd);
    const key = cmd.join(" ");
    const result = options?.results?.[key] ?? {
      exitCode: 0,
      stdout: "",
      stderr: "",
    };
    const delay = options?.delays?.[key] ?? 0;
    if (delay <= 0) {
      options?.onEnd?.(cmd);
      return result;
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        options?.onEnd?.(cmd);
        resolve(result);
      }, delay);
    });
  };
  return { spawn, commands };
}

function captureLogs() {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    lines,
    errors,
    log: {
      log: (message: string) => {
        lines.push(message);
      },
      error: (message: string) => {
        errors.push(message);
      },
    },
  };
}

describe("mapFilesToPackages", () => {
  it("maps package prefixes and e2e/ to web", () => {
    expect(
      mapFilesToPackages([
        "packages/scripts/src/testing/verify.ts",
        "packages/core/src/types/event.ts",
        "e2e/calendar.spec.ts",
        "README.md",
        ".github/workflows/test-unit.yml",
      ]),
    ).toEqual(["core", "web", "scripts"]);
  });

  it("selects the self-host suite for self-host/ changes", () => {
    expect(
      mapFilesToPackages(["self-host/serve-web.ts", "self-host/compose.yaml"]),
    ).toEqual(["self-host"]);
    expect(
      planVerify({
        packages: mapFilesToPackages(["self-host/serve-web.ts"]),
        playwrightChromiumAvailable: false,
      }).checks.map((check) => check.id),
    ).toContain("test:self-host");
  });

  it("does not invent core/web for docs-only or empty diffs", () => {
    expect(
      mapFilesToPackages(["docs/development/testing-playbook.md"]),
    ).toEqual([]);
    expect(mapFilesToPackages(["README.md", "AGENTS.md"])).toEqual([]);
    expect(mapFilesToPackages([])).toEqual([]);
  });
});

describe("planVerify", () => {
  it("runs type-check, lint, and knip with no invented packages", () => {
    const plan = planVerify({
      packages: [],
      playwrightChromiumAvailable: false,
    });
    expect(plan.packages).toEqual([]);
    expect(plan.checks.map((check) => check.id)).toEqual([
      "type-check",
      "lint",
      "knip",
    ]);
    expect(plan.checks.find((check) => check.id === "type-check")?.cmd).toEqual(
      ["bun", "run", "type-check"],
    );
    expect(plan.checks.find((check) => check.id === "knip")?.cmd).toEqual([
      "bun",
      "run",
      "knip",
    ]);
    expect(plan.playwrightSelected).toBe(false);
    expect(plan.skips).toEqual([]);
  });

  it("selects a11y and e2e for an e2e/-only diff when Chromium is present", () => {
    const files = ["e2e/calendar.spec.ts"];
    const plan = planVerify({
      packages: mapFilesToPackages(files),
      playwrightChromiumAvailable: true,
    });
    expect(plan.packages).toEqual(["web"]);
    expect(plan.checks.map((check) => check.id)).toEqual([
      "test:web",
      "type-check",
      "lint",
      "knip",
      "test:a11y",
      "test:e2e",
    ]);
  });

  it("skips Playwright checks when Chromium is missing", () => {
    const files = ["packages/web/src/App.tsx"];
    const plan = planVerify({
      packages: mapFilesToPackages(files),
      playwrightChromiumAvailable: false,
    });
    expect(plan.checks.map((check) => check.id)).not.toContain("test:e2e");
    expect(plan.skips.map((skip) => skip.id)).toEqual([
      "test:a11y",
      "test:e2e",
    ]);
    expect(plan.skips[0]?.reason).toContain(PLAYWRIGHT_INSTALL_COMMAND);
    expect(plan.playwrightSelected).toBe(true);
  });

  it("picks test:sync:fast for a provider-only sync diff", () => {
    const files = ["packages/sync/src/providers/foo.ts"];
    const plan = planVerify({
      packages: mapFilesToPackages(files),
      files,
      playwrightChromiumAvailable: false,
    });
    expect(plan.checks.map((check) => check.id)).toEqual([
      "test:sync:fast",
      "type-check",
      "lint",
      "knip",
    ]);
    expect(plan.checks[0]?.reason).toContain("no *.db.test.ts");
  });

  it("picks test:sync for a storage/repositories sync diff", () => {
    const files = ["packages/sync/src/storage/repositories/x.ts"];
    const plan = planVerify({
      packages: mapFilesToPackages(files),
      files,
      playwrightChromiumAvailable: false,
    });
    expect(plan.checks.map((check) => check.id)).toEqual([
      "test:sync",
      "type-check",
      "lint",
      "knip",
    ]);
    expect(plan.checks[0]?.reason).toContain("/storage/");
  });
});

describe("selectPackageTestCheck", () => {
  it("keeps the full suite for web because there is no fast script", () => {
    expect(selectPackageTestCheck("web", ["packages/web/src/App.tsx"]).id).toBe(
      "test:web",
    );
  });

  it("keeps the full suite when a db test is in the package diff", () => {
    expect(
      selectPackageTestCheck("backend", [
        "packages/backend/src/routes/events.db.test.ts",
      ]).id,
    ).toBe("test:backend");
  });
});

describe("resolveMergeBase and collectChangedFiles", () => {
  it("fetches origin/main when missing, then unions committed, staged, unstaged, and untracked files", () => {
    let fetched = false;
    const git = gitStub({
      refs: ["main"],
      mergeBases: { "HEAD:origin/main": "deadbeef" },
      fetch: () => {
        fetched = true;
      },
      diffs: {
        "deadbeef...HEAD": ["packages/scripts/src/testing/verify.ts"],
        "--cached": ["packages/scripts/src/testing/verify.test.ts"],
        "": ["docs/development/testing-playbook.md"],
      },
      untracked: ["packages/web/src/App.tsx"],
    });
    const mergeBase = resolveMergeBase(git);
    expect(fetched).toBe(true);
    expect(mergeBase).toEqual({ sha: "deadbeef", ref: "origin/main" });
    expect(collectChangedFiles(git, mergeBase.sha)).toEqual([
      "packages/scripts/src/testing/verify.ts",
      "packages/scripts/src/testing/verify.test.ts",
      "docs/development/testing-playbook.md",
      "packages/web/src/App.tsx",
    ]);
  });

  it("falls back to main when origin/main cannot be resolved", () => {
    const git = gitStub({
      refs: ["main"],
      mergeBases: { "HEAD:main": "fff111" },
    });
    expect(resolveMergeBase(git)).toEqual({ sha: "fff111", ref: "main" });
  });
});

describe("chromiumInstallLocationFromDryRun", () => {
  it("parses the Chromium install location from playwright dry-run output", () => {
    const output = [
      "Chrome for Testing 131.0.6778.33 (playwright chromium v1148)",
      "  Install location:    /home/user/.cache/ms-playwright/chromium-1148",
      "  Download url:        https://example.invalid/chromium.zip",
    ].join("\n");
    expect(chromiumInstallLocationFromDryRun(output)).toBe(
      "/home/user/.cache/ms-playwright/chromium-1148",
    );
  });
});

describe("runVerify", () => {
  it("runs scripts fast tests plus type-check, lint, and knip for a scripts-only tree", async () => {
    const { spawn, commands } = recordingSpawn();
    const logs = captureLogs();
    const exitCode = await runVerify([], {
      git: gitStub({
        diffs: {
          "abc123...HEAD": ["packages/scripts/src/testing/verify.ts"],
        },
      }),
      spawn,
      log: logs.log,
      chromiumAvailable: () => false,
    });

    expect(exitCode).toBe(0);
    expect(commands).toEqual([
      ["bun", "run", "test:scripts:fast"],
      ["bun", "run", "type-check"],
      ["bun", "run", "lint"],
      ["bun", "run", "knip"],
    ]);
    expect(
      logs.lines.some((line) => line.includes("no packages detected")),
    ).toBe(false);
    expect(logs.lines.join("\n")).toContain("Detected changes in: scripts");
    expect(logs.lines.join("\n")).toContain("Tier test:scripts:fast:");
    expect(logs.lines.join("\n")).toContain("── test:scripts:fast ──");
    expect(logs.lines.join("\n")).toContain("All checks passed");
    expect(logs.lines.at(-1)).toBe("VERDICT: PASS");
  });

  it("prints no packages detected and still runs type-check, lint, and knip", async () => {
    const { spawn, commands } = recordingSpawn();
    const logs = captureLogs();
    const exitCode = await runVerify([], {
      git: gitStub({
        diffs: { "abc123...HEAD": ["README.md"] },
      }),
      spawn,
      log: logs.log,
      chromiumAvailable: () => false,
    });

    expect(exitCode).toBe(0);
    expect(commands).toEqual([
      ["bun", "run", "type-check"],
      ["bun", "run", "lint"],
      ["bun", "run", "knip"],
    ]);
    expect(logs.lines).toContain("no packages detected");
    expect(logs.lines.join("\n")).not.toContain("falling back to: core");
  });

  it("exits 1 and lists type-check when that spawn fails", async () => {
    const { spawn } = recordingSpawn({
      results: {
        "bun run type-check": {
          exitCode: 1,
          stdout: "",
          stderr: "type error",
        },
      },
    });
    const logs = captureLogs();
    const exitCode = await runVerify([], {
      git: gitStub({
        diffs: { "abc123...HEAD": ["packages/scripts/src/testing/verify.ts"] },
      }),
      spawn,
      log: logs.log,
      chromiumAvailable: () => false,
    });

    expect(exitCode).toBe(1);
    expect(logs.errors.join("\n")).toContain("Failed: type-check");
    expect(logs.lines.at(-1)).toBe("VERDICT: FAIL");
  });

  it("selects e2e for an e2e/-only diff and reports incomplete parity when Chromium is missing", async () => {
    const { spawn, commands } = recordingSpawn();
    const logs = captureLogs();
    const exitCode = await runVerify([], {
      git: gitStub({
        diffs: { "abc123...HEAD": ["e2e/calendar.spec.ts"] },
      }),
      spawn,
      log: logs.log,
      chromiumAvailable: () => false,
    });

    expect(exitCode).toBe(0);
    expect(commands).toEqual([
      ["bun", "run", "test:web"],
      ["bun", "run", "type-check"],
      ["bun", "run", "lint"],
      ["bun", "run", "knip"],
    ]);
    expect(logs.lines.join("\n")).toContain("Skipping test:e2e");
    expect(logs.lines.join("\n")).toContain(PLAYWRIGHT_INSTALL_COMMAND);
    expect(logs.lines.join("\n")).toContain("CI parity incomplete");
    expect(logs.lines.join("\n")).not.toContain("All checks passed");
    expect(logs.lines.at(-1)).toBe("VERDICT: INCOMPLETE");
  });

  it("exits 1 on an incomplete run under --strict", async () => {
    const { spawn } = recordingSpawn();
    const logs = captureLogs();
    const exitCode = await runVerify(["--strict"], {
      git: gitStub({
        diffs: { "abc123...HEAD": ["e2e/calendar.spec.ts"] },
      }),
      spawn,
      log: logs.log,
      chromiumAvailable: () => false,
    });

    expect(exitCode).toBe(1);
    expect(logs.lines.at(-1)).toBe("VERDICT: INCOMPLETE");
    expect(logs.errors.join("\n")).toContain("--strict");
  });

  it("starts Playwright only after independent checks finish", async () => {
    const events: string[] = [];
    const { spawn } = recordingSpawn({
      delays: {
        "bun run test:web": 40,
        "bun run type-check": 20,
        "bun run lint": 10,
        "bun run knip": 10,
        "bun run test:a11y": 10,
        "bun run test:e2e": 10,
      },
      onStart: (cmd) => events.push(`start ${cmd[2]}`),
      onEnd: (cmd) => events.push(`end ${cmd[2]}`),
    });
    const logs = captureLogs();
    const exitCode = await runVerify([], {
      git: gitStub({
        diffs: { "abc123...HEAD": ["e2e/calendar.spec.ts"] },
      }),
      spawn,
      log: logs.log,
      chromiumAvailable: () => true,
    });

    expect(exitCode).toBe(0);
    const lastIndependentEnd = Math.max(
      events.indexOf("end test:web"),
      events.indexOf("end type-check"),
      events.indexOf("end lint"),
      events.indexOf("end knip"),
    );
    expect(events.indexOf("start test:a11y")).toBeGreaterThan(
      lastIndependentEnd,
    );
    expect(events.indexOf("start test:e2e")).toBeGreaterThan(
      events.indexOf("end test:a11y"),
    );
  });

  it("runs a web plus backend diff at least 40 percent faster concurrently than --serial", async () => {
    const delays = {
      "bun run test:web": 200,
      "bun run test:backend:fast": 80,
      "bun run type-check": 120,
      "bun run lint": 60,
      "bun run knip": 60,
    };
    const git = gitStub({
      diffs: {
        "abc123...HEAD": [
          "packages/web/src/App.tsx",
          "packages/backend/src/routes/events.ts",
        ],
      },
    });

    const serial = recordingSpawn({ delays });
    const serialLogs = captureLogs();
    const serialStarted = performance.now();
    const serialCode = await runVerify(["--serial"], {
      git,
      spawn: serial.spawn,
      log: serialLogs.log,
      chromiumAvailable: () => false,
    });
    const serialMs = performance.now() - serialStarted;

    const concurrent = recordingSpawn({ delays });
    const concurrentLogs = captureLogs();
    const concurrentStarted = performance.now();
    const concurrentCode = await runVerify([], {
      git,
      spawn: concurrent.spawn,
      log: concurrentLogs.log,
      chromiumAvailable: () => false,
    });
    const concurrentMs = performance.now() - concurrentStarted;

    expect(serialCode).toBe(0);
    expect(concurrentCode).toBe(0);
    expect(serial.commands).toEqual([
      ["bun", "run", "test:web"],
      ["bun", "run", "test:backend:fast"],
      ["bun", "run", "type-check"],
      ["bun", "run", "lint"],
      ["bun", "run", "knip"],
    ]);
    expect(concurrent.commands).toEqual(serial.commands);
    expect(serialLogs.lines.join("\n")).toContain("Running serial:");
    expect(concurrentLogs.lines.join("\n")).toContain("Running concurrent:");
    expect(concurrentMs).toBeLessThan(serialMs * 0.6);
    expect(serialMs).toBeGreaterThan(concurrentMs);
  });
});
