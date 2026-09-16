/**
 * Runs `bun test --parallel` with a package preload and no shared mongod.
 * Used for core, web, and mongo-free `:fast` tiers.
 *
 * Usage:
 *   bun test-parallel.ts <profile> -- [bun test flags/paths...]
 */

import { backendTestSpawnEnv } from "./backend-test-env";
import {
  formatDuration,
  resolveTestTargets,
  warnIfBunVersionMismatch,
} from "./runner-utils";
import { resolve } from "node:path";

export type ProfileName =
  | "core"
  | "web"
  | "backend-fast"
  | "sync-fast"
  | "scripts-fast";

/** Synthetic URI for :fast tiers — env contract only, no mongod connection. */
const FAST_MONGO_URI = "mongodb://127.0.0.1:27017/unused-compass-test";

const PROFILES: Record<
  ProfileName,
  { preload: string; scan: string; label: string }
> = {
  core: {
    preload: "packages/scripts/src/testing/core.preload.ts",
    scan: "./packages/core/src",
    label: "core",
  },
  web: {
    preload: "packages/web/src/__tests__/web.preload.ts",
    scan: "./packages/web/src",
    label: "web",
  },
  "backend-fast": {
    preload: "packages/backend/src/__tests__/backend.preload.fast.ts",
    scan: "./packages/backend/src",
    label: "backend (fast)",
  },
  "sync-fast": {
    preload: "packages/sync/src/__tests__/sync.preload.fast.ts",
    scan: "./packages/sync/src",
    label: "sync (fast)",
  },
  "scripts-fast": {
    preload: "packages/scripts/src/testing/scripts.preload.fast.ts",
    scan: "./packages/scripts/src",
    label: "scripts (fast)",
  },
};

/**
 * Isolate jsdom workers each hold a Window graph. Default `--parallel`
 * (CPU count) OOMs GitHub runners; two workers keep `--parallel` without
 * restoring shards.
 */
const WEB_PARALLEL_WORKERS = 2;

export function testArgvFor(
  profile: ProfileName,
  opts: {
    preloadPath: string;
    bunFlags: string[];
    targets: string[];
  },
): string[] {
  const needsHookTimeout =
    profile === "backend-fast" ||
    profile === "sync-fast" ||
    profile === "scripts-fast";

  const parallelFlag =
    profile === "web" ? `--parallel=${WEB_PARALLEL_WORKERS}` : "--parallel";

  return [
    "bun",
    "test",
    parallelFlag,
    ...(needsHookTimeout ? ["--timeout", "60000"] : []),
    "--preload",
    opts.preloadPath,
    ...opts.bunFlags,
    ...opts.targets,
  ];
}

async function runCli(): Promise<void> {
  warnIfBunVersionMismatch("1.3.14");

  const profile = process.argv[2] as ProfileName;
  const separatorIndex = process.argv.indexOf("--");
  const extraArgs =
    separatorIndex === -1
      ? process.argv.slice(3)
      : process.argv.slice(separatorIndex + 1);

  if (!profile || !PROFILES[profile]) {
    console.error(
      "Usage: test-parallel.ts <core|web|backend-fast|sync-fast|scripts-fast> -- [bun test flags/paths...]",
    );
    process.exit(2);
  }

  const { preload, scan, label } = PROFILES[profile];
  const preloadPath = resolve(preload);
  const { targets, bunFlags } = resolveTestTargets(scan, extraArgs, {
    expandDirectory: true,
  });

  const started = Date.now();
  const spawnEnv =
    profile === "backend-fast" || profile === "scripts-fast"
      ? backendTestSpawnEnv(FAST_MONGO_URI)
      : { ...process.env, TZ: "Etc/UTC", NODE_ENV: "test" };

  console.log(`Running ${label}...`);

  const proc = Bun.spawn(
    testArgvFor(profile, {
      preloadPath,
      bunFlags,
      targets,
    }),
    {
      env: spawnEnv,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await proc.exited;
  if (code !== 0) {
    console.log(`\n${label}: finished in ${formatDuration(started)}s`);
    process.exit(code ?? 1);
  }

  console.log(`\n${label}: finished in ${formatDuration(started)}s`);
}

if (import.meta.main) {
  await runCli();
}
