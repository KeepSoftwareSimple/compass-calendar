import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * Local required-check subset for AI coding loops.
 *
 * Detects packages from the merge-base vs origin/main plus the working tree,
 * then runs the matching `test:<pkg>` (or `test:<pkg>:fast`) scripts plus
 * type-check, lint, and knip. `self-host/` is a suite here too, though it is
 * not a workspace package: its tests cover the runtime server and the
 * compose/deploy contracts. Independent checks run concurrently unless
 * `--serial` is passed. Web or e2e/ changes also select Playwright a11y and
 * e2e after that wave, unless Chromium is missing — in that case the helper
 * skips those checks and reports incomplete CI parity instead of a silent pass.
 *
 * The last line is always machine-readable: `VERDICT: PASS`, `VERDICT:
 * INCOMPLETE` (every selected check passed but a Playwright check was
 * skipped, so CI parity is not proven), or `VERDICT: FAIL`. INCOMPLETE exits
 * 0 by default so a Chromium-less machine can still iterate; `--strict`
 * makes it exit 1, which is what a PR gate should use.
 *
 * Usage:
 *   bun run verify              — auto-detect from git
 *   bun run verify web          — run web suite + required static checks
 *   bun run verify core web     — run specific suites + required static checks
 *   bun run verify --serial     — run checks one after another (debugging)
 *   bun run verify --strict     — exit 1 on VERDICT: INCOMPLETE
 */

const WORKSPACE_PACKAGES = [
  "core",
  "sync",
  "web",
  "backend",
  "scripts",
  "booking-web",
] as const;
/** Suites with a `test:<name>` script that live outside `packages/`. */
const STANDALONE_PREFIXES = { "self-host/": "self-host" } as const;
const VALID_PACKAGES = [
  ...WORKSPACE_PACKAGES,
  ...Object.values(STANDALONE_PREFIXES),
] as const;
export type Package = (typeof VALID_PACKAGES)[number];

const PACKAGE_ROOTS: Record<Package, string> = {
  core: "packages/core/",
  sync: "packages/sync/",
  web: "packages/web/",
  backend: "packages/backend/",
  scripts: "packages/scripts/",
  "booking-web": "apps/booking-web/",
  "self-host": "self-host/",
};

const PACKAGE_PREFIXES: Record<string, Package> = Object.fromEntries(
  Object.entries(PACKAGE_ROOTS).map(([pkg, root]) => [root, pkg as Package]),
);

const MERGE_BASE_REFS = ["origin/main", "main", "master"] as const;
export const PLAYWRIGHT_INSTALL_COMMAND = "bunx playwright install chromium";
const CHROMIUM_MISSING_REASON = `Playwright Chromium missing; install with: ${PLAYWRIGHT_INSTALL_COMMAND}`;
const PLAYWRIGHT_CHECKS = ["test:a11y", "test:e2e"] as const;
const FAST_TEST_PACKAGES = new Set<Package>(["backend", "sync", "scripts"]);
export const SERIAL_FLAG = "--serial";
export const STRICT_FLAG = "--strict";
export type Verdict = "PASS" | "INCOMPLETE" | "FAIL";
const FAST_TIER_REASON =
  "no *.db.test.ts and no /storage/ or /repositories/ paths";

export type GitCommands = {
  hasRef(ref: string): boolean;
  fetch(remote: string, branch: string): void;
  mergeBase(a: string, b: string): string | null;
  diffNameOnly(args: string[]): string[];
  untrackedNames(): string[];
};

export type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SpawnFn = (
  cmd: string[],
  options?: {
    env?: Record<string, string | undefined>;
    stdio?: "inherit" | "pipe";
  },
) => SpawnResult | Promise<SpawnResult>;

export type Logger = {
  log(message: string): void;
  error(message: string): void;
};

export type PlannedCheck = {
  id: string;
  cmd: string[];
  reason?: string;
};

export type PlannedSkip = {
  id: string;
  reason: string;
};

export type VerifyPlan = {
  packages: Package[];
  checks: PlannedCheck[];
  skips: PlannedSkip[];
  playwrightSelected: boolean;
};

export type VerifyDeps = {
  git: GitCommands;
  spawn: SpawnFn;
  log: Logger;
  chromiumAvailable?: (spawn: SpawnFn) => boolean | Promise<boolean>;
};

function isPackage(value: string): value is Package {
  return (VALID_PACKAGES as readonly string[]).includes(value);
}

function isPlaywrightCheck(checkId: string): boolean {
  return (PLAYWRIGHT_CHECKS as readonly string[]).includes(checkId);
}

function combinedSpawnOutput(result: SpawnResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

export function mapFilesToPackages(files: string[]): Package[] {
  const packages = new Set<Package>();
  for (const file of files) {
    if (file.startsWith("e2e/")) {
      packages.add("web");
      continue;
    }
    for (const [prefix, pkg] of Object.entries(PACKAGE_PREFIXES)) {
      if (file.startsWith(prefix)) {
        packages.add(pkg);
      }
    }
  }
  return VALID_PACKAGES.filter((pkg) => packages.has(pkg));
}

export function chromiumInstallLocationFromDryRun(
  output: string,
): string | null {
  const match = output.match(
    /playwright chromium[^\n]*\n[ \t]+Install location:[ \t]+(\S+)/i,
  );
  return match?.[1] ?? null;
}

async function detectChromiumAvailable(spawn: SpawnFn): Promise<boolean> {
  const result = await Promise.resolve(
    spawn(["bunx", "playwright", "install", "--dry-run", "chromium"], {
      stdio: "pipe",
    }),
  );
  const location = chromiumInstallLocationFromDryRun(
    combinedSpawnOutput(result),
  );
  return location != null && existsSync(location);
}

function filesForPackage(pkg: Package, files: string[]): string[] {
  const prefix = PACKAGE_ROOTS[pkg];
  return files.filter((file) => file.startsWith(prefix));
}

function fileForcesFullPackageSuite(file: string): boolean {
  return (
    file.endsWith(".db.test.ts") ||
    file.includes("/storage/") ||
    file.includes("/repositories/")
  );
}

export function selectPackageTestCheck(
  pkg: Package,
  files: string[],
): PlannedCheck {
  const fullId = `test:${pkg}`;
  const fullCmd = ["bun", "run", fullId];
  if (!FAST_TEST_PACKAGES.has(pkg)) {
    return { id: fullId, cmd: fullCmd };
  }

  const pkgFiles = filesForPackage(pkg, files);
  if (pkgFiles.length === 0) {
    return {
      id: fullId,
      cmd: fullCmd,
      reason: "changed files unavailable; using full suite",
    };
  }

  const hit = pkgFiles.find(fileForcesFullPackageSuite);
  if (hit) {
    const why = hit.endsWith(".db.test.ts")
      ? `${hit} is a *.db.test.ts`
      : hit.includes("/storage/")
        ? `${hit} contains /storage/`
        : `${hit} contains /repositories/`;
    return { id: fullId, cmd: fullCmd, reason: why };
  }

  const fastId = `test:${pkg}:fast`;
  return {
    id: fastId,
    cmd: ["bun", "run", fastId],
    reason: FAST_TIER_REASON,
  };
}

export function planVerify(input: {
  packages: Package[];
  files?: string[];
  playwrightChromiumAvailable: boolean;
}): VerifyPlan {
  const packages = VALID_PACKAGES.filter((pkg) => input.packages.includes(pkg));
  const files = input.files ?? [];
  const checks: PlannedCheck[] = packages.map((pkg) =>
    selectPackageTestCheck(pkg, files),
  );

  checks.push({ id: "type-check", cmd: ["bun", "run", "type-check"] });
  checks.push({ id: "lint", cmd: ["bun", "run", "lint"] });
  checks.push({ id: "knip", cmd: ["bun", "run", "knip"] });

  const skips: PlannedSkip[] = [];
  const playwrightSelected = packages.includes("web");

  if (playwrightSelected) {
    if (input.playwrightChromiumAvailable) {
      for (const id of PLAYWRIGHT_CHECKS) {
        checks.push({ id, cmd: ["bun", "run", id] });
      }
    } else {
      for (const id of PLAYWRIGHT_CHECKS) {
        skips.push({ id, reason: CHROMIUM_MISSING_REASON });
      }
    }
  }

  return {
    packages,
    checks,
    skips,
    playwrightSelected,
  };
}

export function resolveMergeBase(git: GitCommands): {
  sha: string;
  ref: string;
} {
  for (const ref of MERGE_BASE_REFS) {
    if (ref === "origin/main" && !git.hasRef(ref)) {
      try {
        git.fetch("origin", "main");
      } catch {
        // Fall through to main/master when origin/main cannot be fetched.
      }
    }
    if (!git.hasRef(ref)) continue;
    const sha = git.mergeBase("HEAD", ref);
    if (sha) return { sha, ref };
  }

  throw new Error(
    "Could not resolve merge-base against origin/main, main, or master. Fetch origin/main instead of comparing against HEAD.",
  );
}

export function collectChangedFiles(
  git: GitCommands,
  mergeBase: string,
): string[] {
  return unique([
    ...git.diffNameOnly([`${mergeBase}...HEAD`]),
    ...git.diffNameOnly(["--cached"]),
    ...git.diffNameOnly([]),
    ...git.untrackedNames(),
  ]);
}

function defaultGit(): GitCommands {
  return {
    hasRef(ref: string): boolean {
      try {
        execGit(["rev-parse", "--verify", "--quiet", ref]);
        return true;
      } catch {
        return false;
      }
    },
    fetch(remote: string, branch: string): void {
      execGit(["fetch", remote, branch]);
    },
    mergeBase(a: string, b: string): string | null {
      try {
        const sha = execGit(["merge-base", a, b]).trim();
        return sha.length > 0 ? sha : null;
      } catch {
        return null;
      }
    },
    diffNameOnly(args: string[]): string[] {
      return splitLines(execGit(["diff", "--name-only", ...args]));
    },
    untrackedNames(): string[] {
      return splitLines(
        execGit(["ls-files", "--others", "--exclude-standard"]),
      );
    },
  };
}

function defaultSpawn(): SpawnFn {
  return (cmd, options) => {
    const inherit = options?.stdio === "inherit";
    const env = options?.env ?? { ...process.env };
    if (inherit) {
      const result = Bun.spawnSync({
        cmd,
        cwd: process.cwd(),
        env,
        stderr: "inherit",
        stdin: "inherit",
        stdout: "inherit",
      });
      return {
        exitCode: result.exitCode,
        stdout: decodeSpawnOutput(result.stdout),
        stderr: decodeSpawnOutput(result.stderr),
      };
    }
    // Concurrent checks need overlapping processes; spawnSync would serialize.
    const proc = Bun.spawn({
      cmd,
      cwd: process.cwd(),
      env,
      stderr: "pipe",
      stdin: "ignore",
      stdout: "pipe",
    });
    return Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]).then(([stdout, stderr, exitCode]) => ({
      exitCode,
      stdout,
      stderr,
    }));
  };
}

function parseVerifyArgs(
  args: string[],
):
  | { ok: true; serial: boolean; strict: boolean; packages: Package[] | null }
  | { ok: false; error: string } {
  const serial = args.includes(SERIAL_FLAG);
  const strict = args.includes(STRICT_FLAG);
  const rest = args.filter((arg) => arg !== SERIAL_FLAG && arg !== STRICT_FLAG);
  const invalid = rest.filter((arg) => !isPackage(arg));
  if (invalid.length > 0) {
    return {
      ok: false,
      error: `Unknown package(s): ${invalid.join(", ")}. Valid: ${VALID_PACKAGES.join(", ")}`,
    };
  }
  return {
    ok: true,
    serial,
    strict,
    packages: rest.length > 0 ? rest.filter(isPackage) : null,
  };
}

function tryCollectChangedFiles(git: GitCommands): {
  files: string[];
  mergeBase?: { sha: string; ref: string };
  error?: string;
} {
  try {
    const mergeBase = resolveMergeBase(git);
    return {
      files: collectChangedFiles(git, mergeBase.sha),
      mergeBase,
    };
  } catch (error) {
    return {
      files: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatOutputBlock(id: string, result: SpawnResult): string {
  const body = [result.stdout, result.stderr]
    .filter((part) => part.length > 0)
    .join("\n")
    .trimEnd();
  return body.length > 0 ? `\n── ${id} ──\n${body}` : `\n── ${id} ──`;
}

export async function runVerify(
  args: string[],
  deps: VerifyDeps = {
    git: defaultGit(),
    spawn: defaultSpawn(),
    log: { log: console.log, error: console.error },
  },
): Promise<number> {
  const { git, spawn, log } = deps;
  const chromiumAvailable = deps.chromiumAvailable ?? detectChromiumAvailable;

  const parsed = parseVerifyArgs(args);
  if (!parsed.ok) {
    log.error(parsed.error);
    return 1;
  }

  const collected = tryCollectChangedFiles(git);
  let packages: Package[];
  const files = collected.files;

  if (parsed.packages) {
    packages = parsed.packages;
  } else {
    if (collected.error) {
      log.error(collected.error);
      return 1;
    }
    packages = mapFilesToPackages(files);
    if (collected.mergeBase) {
      log.log(
        `merge-base: ${collected.mergeBase.sha} (${collected.mergeBase.ref})`,
      );
    }
    log.log(
      `files used for detection (${files.length}): ${
        files.length > 0 ? files.join(", ") : "(none)"
      }`,
    );
    if (packages.length === 0) {
      log.log("no packages detected");
    } else {
      log.log(`Detected changes in: ${packages.join(", ")}`);
    }
  }

  const playwrightSelected = packages.includes("web");
  const plan = planVerify({
    packages,
    files,
    playwrightChromiumAvailable: playwrightSelected
      ? await Promise.resolve(chromiumAvailable(spawn))
      : true,
  });

  const independent = plan.checks.filter(
    (check) => !isPlaywrightCheck(check.id),
  );
  const playwright = plan.checks.filter((check) => isPlaywrightCheck(check.id));

  for (const check of independent) {
    if (check.reason) {
      log.log(`Tier ${check.id}: ${check.reason}`);
    }
  }

  const runningLabel = parsed.serial ? "serial" : "concurrent";
  log.log(
    `Running ${runningLabel}: ${independent.map((check) => check.id).join(", ")}`,
  );
  if (playwright.length > 0) {
    log.log(
      `Then Playwright: ${playwright.map((check) => check.id).join(" → ")}`,
    );
  }
  if (plan.skips.length > 0) {
    for (const skip of plan.skips) {
      log.log(`Skipping ${skip.id}: ${skip.reason}`);
    }
  }

  const failed: string[] = [];
  const skips = [...plan.skips];
  const executed: string[] = [];

  const recordResult = (check: PlannedCheck, result: SpawnResult): void => {
    if (result.exitCode !== 0) {
      if (isMissingPlaywrightBrowser(result, check.id)) {
        skips.push({ id: check.id, reason: CHROMIUM_MISSING_REASON });
        log.log(`Skipping ${check.id}: ${CHROMIUM_MISSING_REASON}`);
        return;
      }
      failed.push(check.id);
      return;
    }
    executed.push(check.id);
  };

  const runCaptured = async (check: PlannedCheck): Promise<SpawnResult> => {
    const result = await Promise.resolve(
      spawn(check.cmd, {
        env: spawnEnvFor(check.id),
        stdio: "pipe",
      }),
    );
    log.log(formatOutputBlock(check.id, result));
    return result;
  };

  const runInherited = async (check: PlannedCheck): Promise<SpawnResult> => {
    log.log(`\n→ ${check.id}`);
    const result = await Promise.resolve(
      spawn(check.cmd, {
        env: spawnEnvFor(check.id),
        stdio: isPlaywrightCheck(check.id) ? "pipe" : "inherit",
      }),
    );
    if (isPlaywrightCheck(check.id)) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
    return result;
  };

  if (parsed.serial) {
    for (const check of [...independent, ...playwright]) {
      recordResult(check, await runInherited(check));
    }
  } else {
    const independentResults = await Promise.all(
      independent.map(async (check) => ({
        check,
        result: await runCaptured(check),
      })),
    );
    for (const { check, result } of independentResults) {
      recordResult(check, result);
    }
    for (const check of playwright) {
      recordResult(check, await runCaptured(check));
    }
  }

  const ciParityComplete = skips.length === 0;

  log.log("\nSummary");
  log.log(
    `Selected packages: ${plan.packages.length > 0 ? plan.packages.join(", ") : "(none)"}`,
  );
  log.log(`Checks run: ${executed.join(", ") || "(none)"}`);
  if (skips.length > 0) {
    log.log(
      `Checks skipped: ${skips.map((skip) => `${skip.id} (${skip.reason})`).join("; ")}`,
    );
  } else {
    log.log("Checks skipped: (none)");
  }

  if (failed.length > 0) {
    log.error(`\nFailed: ${failed.join(", ")}`);
    log.log(verdictLine("FAIL"));
    return 1;
  }

  if (!ciParityComplete) {
    log.log(
      `\n✓ selected checks passed; CI parity incomplete: ${unique(
        skips.map((skip) => skip.reason),
      ).join("; ")}`,
    );
    log.log(verdictLine("INCOMPLETE"));
    if (parsed.strict) {
      log.error(
        `${STRICT_FLAG}: INCOMPLETE is not PASS; run the skipped checks`,
      );
      return 1;
    }
    return 0;
  }

  log.log("\n✓ All checks passed");
  log.log(verdictLine("PASS"));
  return 0;
}

export function verdictLine(verdict: Verdict): string {
  return `VERDICT: ${verdict}`;
}

function splitLines(output: string): string[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function spawnEnvFor(checkId: string): Record<string, string | undefined> {
  const timezone = process.env["TZ"] ?? "Etc/UTC";
  if (isPlaywrightCheck(checkId)) return playwrightEnv(timezone);
  if (checkId.startsWith("test:")) {
    return { ...process.env, NODE_ENV: "test", TZ: timezone };
  }
  return { ...process.env, TZ: timezone };
}

function playwrightEnv(timezone: string): Record<string, string | undefined> {
  // Playwright's Bun web server reports a color-env conflict when the parent
  // process forces ANSI colors, and Node 26 reports its known module-loader
  // deprecation. These are upstream runtime diagnostics, not test failures;
  // remove only those two messages from this verification subprocess.
  const nodeOptions = [process.env["NODE_OPTIONS"], "--disable-warning=DEP0205"]
    .filter(Boolean)
    .join(" ");
  const {
    FORCE_COLOR: _forceColor,
    NO_COLOR: _noColor,
    ...processEnvWithoutColorOverrides
  } = process.env;
  return {
    ...processEnvWithoutColorOverrides,
    TZ: timezone,
    NODE_OPTIONS: nodeOptions,
  };
}

function isMissingPlaywrightBrowser(
  result: SpawnResult,
  checkId: string,
): boolean {
  if (!isPlaywrightCheck(checkId)) return false;
  const output = combinedSpawnOutput(result).toLowerCase();
  return (
    output.includes("executable doesn't exist") ||
    output.includes("browserType.launch") ||
    output.includes("playwright chromium") ||
    (output.includes("chromium") && output.includes("install"))
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function execGit(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

function decodeSpawnOutput(value: Uint8Array | string | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return new TextDecoder().decode(value);
}

if (import.meta.main) {
  process.exit(await runVerify(process.argv.slice(2)));
}
