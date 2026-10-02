/**
 * Boots one in-memory Mongo replica set and runs native `bun test --parallel`
 * with shared mongod. Per-file DB isolation uses setupTestDb(import.meta.url).
 *
 * Glob paths are passed through to Bun — never expanded into per-file argv lists,
 * which can hang the runner.
 *
 * Usage:
 *   bun test-mongo-env.ts <backend|scripts|sync> -- [bun test flags/paths...]
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { backendTestSpawnEnv } from "./backend-test-env";
import {
  bunTestRunExitCode,
  bunTestRunLooksFinished,
  createBunTestRunProgress,
  ingestBunTestOutput,
} from "./bun-test-run-progress";
import {
  formatDuration,
  resolveTestTargets,
  warnIfBunVersionMismatch,
} from "./runner-utils";
import { resolve } from "node:path";

warnIfBunVersionMismatch("1.3.14");

type PackageName = "backend" | "scripts" | "sync";

const PACKAGES: Record<
  PackageName,
  { preload: string; scan: string; glob: string }
> = {
  backend: {
    preload: "packages/backend/src/__tests__/backend.preload.ts",
    scan: "./packages/backend/src",
    glob: "packages/backend/src/**/*.{test,spec}.{ts,tsx}",
  },
  scripts: {
    preload: "packages/scripts/src/testing/scripts.preload.ts",
    scan: "./packages/scripts/src",
    glob: "packages/scripts/src/**/*.{test,spec}.{ts,tsx}",
  },
  sync: {
    preload: "packages/sync/src/__tests__/sync.preload.ts",
    scan: "./packages/sync/src",
    glob: "packages/sync/src/**/*.{test,spec}.{ts,tsx}",
  },
};

const BACKEND_HEADER_SESSION =
  "./packages/backend/src/auth/__tests__/header-session.test.ts";

const pkg = process.argv[2] as PackageName;
const separatorIndex = process.argv.indexOf("--");
const extraArgs =
  separatorIndex === -1
    ? process.argv.slice(3)
    : process.argv.slice(separatorIndex + 1);

if (!pkg || !PACKAGES[pkg]) {
  console.error(
    "Usage: test-mongo-env.ts <backend|scripts|sync> -- [bun test flags/paths...]",
  );
  process.exit(2);
}

const { preload, scan } = PACKAGES[pkg];
const preloadPath = resolve(preload);
const { targets, bunFlags, label } = resolveTestTargets(scan, extraArgs);

const started = Date.now();

const server = await MongoMemoryReplSet.create({
  replSet: { count: 1, name: "compass-test", storageEngine: "wiredTiger" },
});
const mongoUri = server.getUri();
const env = backendTestSpawnEnv(mongoUri);

function isHeaderSessionTarget(target: string): boolean {
  return target.includes("header-session.test.ts");
}

function extraArgsIgnoreHeaderSession(): boolean {
  for (let i = 0; i < extraArgs.length; i++) {
    if (
      extraArgs[i] === "--path-ignore-patterns" &&
      extraArgs[i + 1]?.includes("header-session")
    ) {
      return true;
    }
  }
  return false;
}

const isFullBackendSuite =
  pkg === "backend" &&
  targets.length === 1 &&
  targets[0] === scan &&
  !extraArgsIgnoreHeaderSession();

const mainBunFlags = [...bunFlags];
if (isFullBackendSuite) {
  mainBunFlags.push("--path-ignore-patterns", "**/header-session.test.ts");
}

const mainParallel = !(
  targets.length === 1 && isHeaderSessionTarget(targets[0] ?? "")
);

type TestInvocation = {
  runLabel: string;
  bunFlags: string[];
  targets: string[];
  parallel: boolean;
};

const invocations: TestInvocation[] = [
  {
    runLabel: label,
    bunFlags: mainBunFlags,
    targets,
    parallel: mainParallel,
  },
];

if (isFullBackendSuite) {
  invocations.push({
    runLabel: "backend SuperTokens integration (header-session)",
    bunFlags: [],
    targets: [BACKEND_HEADER_SESSION],
    parallel: false,
  });
}

console.log(`Running ${label} (${pkg})...`);

/**
 * A worker that ends still holding an open handle (a Mongo connection is the
 * usual culprit: cleanupTestDb deliberately never disconnects, and the
 * shared-mongod path makes stopMemoryMongo a no-op) never exits, so `bun test`
 * never exits either. Bun prints "Ran N tests across M files" only after every
 * worker exits, so a leak also swallows the summary. Watch both streams, and
 * if output goes quiet after passing tests, kill the worker and use that
 * progress as the result. The four-minute wedge is the last resort for a
 * suite that never started; a green leak must not fail CI.
 */
const EXIT_TIMEOUT_MS = 4 * 60 * 1000;
const EXIT_GRACE_MS = 3_000;
/** Just over `--timeout 60000` so a slow last test can still print. */
const QUIET_AFTER_OUTPUT_MS = 65_000;

function watchStream(
  stream: ReadableStream<Uint8Array>,
  dest: { write(text: string): unknown },
  onText: (text: string) => void,
): void {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  const pump = (): Promise<void> =>
    reader.read().then(({ done, value }) => {
      if (done) return;
      const text = decoder.decode(value, { stream: true });
      dest.write(text);
      onText(text);
      return pump();
    });
  void pump();
}

async function runTestInvocation(invocation: TestInvocation): Promise<number> {
  const testTargets = [
    "bun",
    "test",
    ...(invocation.parallel ? (["--parallel"] as const) : []),
    "--timeout",
    "60000",
    "--preload",
    preloadPath,
    ...invocation.bunFlags,
    ...invocation.targets,
  ];

  console.log(`\nRunning ${invocation.runLabel} (${pkg})...`);

  const proc = Bun.spawn(testTargets, {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  const progress = createBunTestRunProgress();
  let wedged: ReturnType<typeof setTimeout> | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  return await new Promise<number>((resolvePromise) => {
    const settle = (exitCode: number, kill: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(wedged);
      clearTimeout(quiet);
      if (kill) proc.kill();
      resolvePromise(exitCode);
    };

    const armQuiet = () => {
      clearTimeout(quiet);
      quiet = setTimeout(
        () => {
          if (!bunTestRunLooksFinished(progress)) return;
          const exitCode = bunTestRunExitCode(progress);
          console.error(
            progress.sawSummary
              ? `\n${pkg}: 'bun test' printed its summary but did not exit; a worker ` +
                  `is holding an open handle. Using the summary as the result.`
              : `\n${pkg}: tests stopped reporting after ${formatDuration(started)}s ` +
                  `with no summary; a worker is holding an open handle. Using the ` +
                  `pass/fail output as the result.`,
          );
          settle(exitCode, true);
        },
        progress.sawSummary ? EXIT_GRACE_MS : QUIET_AFTER_OUTPUT_MS,
      );
    };

    proc.exited.then((exit) => settle(exit ?? 1, false));
    const onText = (text: string) => {
      ingestBunTestOutput(text, progress);
      armQuiet();
    };
    watchStream(proc.stdout, process.stdout, onText);
    watchStream(proc.stderr, process.stderr, onText);

    wedged = setTimeout(() => {
      if (bunTestRunLooksFinished(progress)) {
        const exitCode = bunTestRunExitCode(progress);
        console.error(
          `\n${pkg}: tests stopped reporting after ${formatDuration(started)}s ` +
            `with no process exit. Using the pass/fail output as the result.`,
        );
        settle(exitCode, true);
        return;
      }
      console.error(
        `\n${pkg}: tests stopped reporting and 'bun test' has not exited after ` +
          `${formatDuration(started)}s with no summary. Killing it so the ` +
          `failure is visible rather than a silent step timeout.`,
      );
      settle(1, true);
    }, EXIT_TIMEOUT_MS);
  });
}

try {
  for (const invocation of invocations) {
    const code = await runTestInvocation(invocation);
    if (code !== 0) {
      process.exit(code);
    }
  }

  console.log(`\n${pkg}: finished in ${formatDuration(started)}s`);
} finally {
  await server.stop();
}
