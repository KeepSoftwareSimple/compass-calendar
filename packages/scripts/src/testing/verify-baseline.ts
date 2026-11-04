/**
 * Baseline comparison for `bun run verify`.
 *
 * When a test check fails, the failing files are rerun on the branch and on
 * the merge-base ref (origin/main) in a temporary git worktree. Each failing
 * test is then classified:
 *
 *   NEW           fails on both branch runs and passes (or is absent) on main
 *   PRE-EXISTING  fails on both branch runs and on main
 *   FLAKY         failed once, then passed on the branch rerun
 *
 * Only NEW failures keep the check red. Output that cannot be parsed into a
 * complete failure list (crashes, errors outside tests, count mismatches)
 * makes the check unclassifiable, and it stays red.
 */

export type Failure = {
  /** Repo-relative path of the test file. */
  file: string;
  /** Stable identity across branch and main: no line or column numbers. */
  key: string;
};

export type BaselineCheckKind = "bun" | "playwright";

export const BASELINE_CHECKS: Record<string, BaselineCheckKind> = {
  "test:web": "bun",
  "test:a11y": "playwright",
  "test:e2e": "playwright",
};

export type Classification = {
  newFailures: Failure[];
  preExisting: Failure[];
  flaky: Failure[];
};

const BUN_FILE_HEADER = /^(\S+\.test\.[cm]?[jt]sx?):$/;
const BUN_FAIL_LINE = /^\(fail\) (.+?)(?: \[[\d.]+m?s\])?$/;
const BUN_FAIL_COUNT = /^\s*(\d+) fail$/;
const BUN_ERROR_COUNT = /^\s*(\d+) errors?$/;
const BUN_RECAP = /^\s*\d+ tests? failed:?$/;

/**
 * Failing tests from `bun test` output (possibly several shards). Returns
 * null unless every counted failure was attributed to a file and no error
 * happened outside a test.
 */
export function parseBunTestFailures(output: string): Failure[] | null {
  const failures: Failure[] = [];
  let file: string | null = null;
  let counted = 0;
  for (const raw of output.split("\n")) {
    const line = raw.trimEnd();
    const header = line.match(BUN_FILE_HEADER);
    if (header) {
      file = header[1] ?? null;
      continue;
    }
    if (BUN_RECAP.test(line)) {
      // The end-of-run recap repeats failures without file headers.
      file = null;
      continue;
    }
    const errors = line.match(BUN_ERROR_COUNT);
    if (errors && Number(errors[1]) > 0) return null;
    const count = line.match(BUN_FAIL_COUNT);
    if (count) {
      counted += Number(count[1]);
      file = null;
      continue;
    }
    const fail = line.match(BUN_FAIL_LINE);
    if (fail && file) {
      failures.push({ file, key: `${file} > ${fail[1]}` });
    }
  }
  if (counted === 0 || counted !== failures.length) return null;
  return failures;
}

const PW_COUNT =
  /^\s*(\d+) (failed|flaky|interrupted|skipped|passed|did not run)/;
const PW_FAILED_TEST =
  /^\s*\[([^\]]+)\] › (\S+?):\d+:\d+ › (.+?)(?: ─+)?(?: \(retry #\d+\))?$/;

/**
 * Failing tests from Playwright's list reporter summary. Returns null unless
 * the listed failures match the `N failed` count and nothing failed outside
 * a test (a web server that never started, a broken config).
 */
export function parsePlaywrightFailures(output: string): Failure[] | null {
  if (/errors? (was|were) not a part of any test/.test(output)) return null;
  const failures: Failure[] = [];
  let expected: number | null = null;
  let inFailed = false;
  for (const raw of output.split("\n")) {
    const line = raw.trimEnd();
    const count = line.match(PW_COUNT);
    if (count) {
      if (count[2] === "interrupted" && Number(count[1]) > 0) return null;
      inFailed = count[2] === "failed";
      if (inFailed) expected = Number(count[1]);
      continue;
    }
    if (!inFailed) continue;
    const test = line.match(PW_FAILED_TEST);
    if (test) {
      const [, project, path, title] = test;
      const file = path!.startsWith("e2e/") ? path! : `e2e/${path}`;
      failures.push({ file, key: `[${project}] › ${file} › ${title}` });
    }
  }
  if (expected === null || expected !== failures.length) return null;
  return failures;
}

export function parseFailures(
  kind: BaselineCheckKind,
  output: string,
): Failure[] | null {
  return kind === "bun"
    ? parseBunTestFailures(output)
    : parsePlaywrightFailures(output);
}

/**
 * Classify the first run's failures against a branch rerun and a main rerun
 * (failure lists only: a test missing from a list passed or did not exist).
 */
export function classifyFailures(input: {
  initial: Failure[];
  branchRerun: Failure[];
  mainRerun: Failure[];
}): Classification {
  const branchKeys = new Set(input.branchRerun.map((f) => f.key));
  const mainKeys = new Set(input.mainRerun.map((f) => f.key));
  const result: Classification = {
    newFailures: [],
    preExisting: [],
    flaky: [],
  };
  const seen = new Set<string>();
  for (const failure of input.initial) {
    if (seen.has(failure.key)) continue;
    seen.add(failure.key);
    if (!branchKeys.has(failure.key)) result.flaky.push(failure);
    else if (mainKeys.has(failure.key)) result.preExisting.push(failure);
    else result.newFailures.push(failure);
  }
  return result;
}

export function uniqueFiles(failures: Failure[]): string[] {
  return [...new Set(failures.map((f) => f.file))];
}

export function rerunCommand(
  kind: BaselineCheckKind,
  files: string[],
): string[] {
  return kind === "bun"
    ? ["bun", "run", "test:web", "--", ...files]
    : ["bunx", "playwright", "test", ...files];
}

export function formatBaselineReport(
  ref: string,
  results: Array<{ checkId: string; classification: Classification }>,
): string[] {
  const section = (
    title: string,
    pick: (c: Classification) => Failure[],
  ): string[] => {
    const rows = results.flatMap(({ checkId, classification }) =>
      pick(classification).map((f) => `- ${checkId}: ${f.key}`),
    );
    return rows.length > 0 ? [`${title} (${rows.length}):`, ...rows] : [];
  };
  return [
    `Baseline against ${ref}:`,
    ...section("NEW, fails only on this branch", (c) => c.newFailures),
    ...section("PRE-EXISTING, fails on main too", (c) => c.preExisting),
    ...section("FLAKY, passed on rerun", (c) => c.flaky),
  ];
}

export type BaselineRunResult = { exitCode: number; output: string };

export type BaselineDeps = {
  /** Run a check's rerun command, in `cwd` when given (the main worktree). */
  run(checkId: string, cmd: string[], cwd?: string): Promise<BaselineRunResult>;
  /** Check out `ref` in a new temporary worktree and return its path. */
  addWorktree(ref: string): string;
  removeWorktree(dir: string): void;
  log(message: string): void;
};

export type BaselineOutcome = {
  /** Failed checks whose failures are all pre-existing or flaky. */
  cleared: string[];
  report: string[];
};

/**
 * Rerun each failed check's failing files on the branch, then on `ref` in a
 * temporary worktree, and report which checks only failed for reasons that
 * are not this branch's.
 */
export async function runBaseline(
  deps: BaselineDeps,
  ref: string,
  failedChecks: Array<{ checkId: string; output: string }>,
): Promise<BaselineOutcome> {
  const pending: Array<{
    checkId: string;
    kind: BaselineCheckKind;
    initial: Failure[];
    branchRerun: Failure[];
  }> = [];
  const unclassified: string[] = [];

  for (const { checkId, output } of failedChecks) {
    const kind = BASELINE_CHECKS[checkId];
    if (!kind) continue;
    const initial = parseFailures(kind, output);
    if (!initial) {
      unclassified.push(`${checkId}: could not list its failing tests`);
      continue;
    }
    deps.log(`\n→ baseline: rerunning ${checkId} failures on this branch`);
    const rerun = await deps.run(
      checkId,
      rerunCommand(kind, uniqueFiles(initial)),
    );
    const branchRerun =
      rerun.exitCode === 0 ? [] : parseFailures(kind, rerun.output);
    if (!branchRerun) {
      unclassified.push(`${checkId}: branch rerun output was not parseable`);
      continue;
    }
    pending.push({ checkId, kind, initial, branchRerun });
  }

  const results: Array<{ checkId: string; classification: Classification }> =
    [];
  const needsMain = pending.filter((p) => p.branchRerun.length > 0);
  let worktree: string | null = null;
  try {
    if (needsMain.length > 0) {
      deps.log(`→ baseline: checking out ${ref} in a temporary worktree`);
      worktree = deps.addWorktree(ref);
      const install = await deps.run(
        "install",
        ["bun", "install", "--frozen-lockfile"],
        worktree,
      );
      if (install.exitCode !== 0) {
        throw new Error(`bun install failed in the ${ref} worktree`);
      }
    }
    for (const p of pending) {
      let mainRerun: Failure[] = [];
      if (p.branchRerun.length > 0 && worktree) {
        deps.log(`→ baseline: rerunning ${p.checkId} failures on ${ref}`);
        const main = await deps.run(
          p.checkId,
          rerunCommand(p.kind, uniqueFiles(p.branchRerun)),
          worktree,
        );
        // Unparseable main output counts as passing there: the failures
        // stay NEW, which keeps the verdict conservative.
        mainRerun =
          main.exitCode === 0 ? [] : (parseFailures(p.kind, main.output) ?? []);
      }
      results.push({
        checkId: p.checkId,
        classification: classifyFailures({
          initial: p.initial,
          branchRerun: p.branchRerun,
          mainRerun,
        }),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      cleared: [],
      report: [`Baseline against ${ref} did not finish: ${message}`],
    };
  } finally {
    if (worktree) deps.removeWorktree(worktree);
  }

  return {
    cleared: results
      .filter((r) => r.classification.newFailures.length === 0)
      .map((r) => r.checkId),
    report: [
      ...formatBaselineReport(ref, results),
      ...unclassified.map((note) => `Not classified, stays failed: ${note}`),
    ],
  };
}
