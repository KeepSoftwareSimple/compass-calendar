/**
 * Runs `bun test --parallel` with a package preload and no shared mongod.
 * Used for core and mongo-free `:fast` tiers.
 *
 * Usage:
 *   bun test-parallel.ts <profile> -- [bun test flags/paths...]
 */

import { backendTestSpawnEnv } from "./backend-test-env";
import {
  formatDuration,
  parseExtraArgs,
  resolveTestTargets,
  warnIfBunVersionMismatch,
} from "./runner-utils";
import { readFileSync } from "node:fs";
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

// Web uses jsdom + MSW XHR patching + module singletons that Bun's parallel
// `--isolate` clears between files (MSW's oldXMLHttpRequest becomes undefined).
// Sequential files in one process is still far faster than the old per-file
// launcher. The full web suite then runs as a few sequential processes so
// jsdom/MSW RSS is released between shards — a single 3k-test process has
// been SIGKILL'd (exit 137) on 7 GB GitHub runners, and on 2026-09-04 a
// 191-file shard took the whole runner down with it ("The runner has
// received a shutdown signal"), which reads as a hang rather than memory.
// Six shards keep each process well under the runner; the RSS guard below
// names the shard when one still runs away.
const DEFAULT_WEB_SHARDS = 6;

/**
 * Kill a shard that outgrows the CI runner before the runner itself dies.
 * ubuntu-latest has 7 GB; a shard past 5 GB is allocating without bound, not
 * running a big test. Linux only (reads /proc); elsewhere it is a no-op.
 */
const MAX_SHARD_RSS_MB = Number(process.env["WEB_TEST_MAX_RSS_MB"] ?? 5_000);

function readRssMb(pid: number): number | null {
  try {
    const status = readFileSync(`/proc/${pid}/status`, "utf8");
    const kb = status.match(/^VmRSS:\s+(\d+) kB/m)?.[1];
    return kb === undefined ? null : Number(kb) / 1024;
  } catch {
    return null;
  }
}

function guardRss(
  proc: ReturnType<typeof Bun.spawn>,
  label: string,
): () => void {
  const timer = setInterval(() => {
    const rss = readRssMb(proc.pid);
    if (rss !== null && rss > MAX_SHARD_RSS_MB) {
      console.error(
        `\n${label} exceeded ${MAX_SHARD_RSS_MB} MB RSS (${Math.round(rss)} MB). ` +
          `A test in this shard is allocating without bound; the file named ` +
          `above is where it stopped. This is memory, not a slow test.`,
      );
      proc.kill();
    }
  }, 1_000);
  return () => clearInterval(timer);
}

export function parallelArgsFor(profile: ProfileName): string[] {
  return profile === "web" ? [] : ["--parallel"];
}

export function shardTargets(
  targets: string[],
  shardCount: number,
): string[][] {
  if (targets.length === 0 || shardCount <= 1) {
    return [targets];
  }
  const count = Math.min(Math.floor(shardCount), targets.length);
  const size = Math.ceil(targets.length / count);
  const shards: string[][] = [];
  for (let i = 0; i < targets.length; i += size) {
    shards.push(targets.slice(i, i + size));
  }
  return shards;
}

export function webSuiteShardCount(opts: {
  explicitPathCount: number;
  envShards?: string;
}): number {
  if (opts.explicitPathCount > 0) {
    return 1;
  }
  const raw = opts.envShards;
  if (raw === undefined || raw === "") {
    return DEFAULT_WEB_SHARDS;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_WEB_SHARDS;
  }
  return Math.floor(parsed);
}

/**
 * 1-based shard pick from `WEB_TEST_SHARD_INDEX`. Unset means run every
 * shard sequentially (local `bun test:web`). A comma list runs those
 * shards in order so CI can pack six RSS-safe processes into two legs
 * (`1,2,3` and `4,5,6`) while still exposing `unit (web, 1)` / `unit (web, 2)`.
 */
export function webSuiteShardIndex(opts: {
  envIndex?: string;
  shardCount: number;
}): number[] | "all" {
  const raw = opts.envIndex;
  if (raw === undefined || raw === "") {
    return "all";
  }
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return "all";
  }
  const indices: number[] = [];
  for (const part of parts) {
    const parsed = Number(part);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > opts.shardCount) {
      throw new Error(
        `WEB_TEST_SHARD_INDEX must be integers from 1 to ${opts.shardCount}, got ${JSON.stringify(raw)}`,
      );
    }
    indices.push(parsed);
  }
  return indices;
}

export function selectWebShards(
  shards: string[][],
  index: number[] | "all",
): { index: number; shard: string[] }[] {
  if (index === "all") {
    return shards.map((shard, shardIndex) => ({
      index: shardIndex,
      shard,
    }));
  }
  return index.map((oneBased) => {
    const shard = shards[oneBased - 1];
    if (shard === undefined) {
      throw new Error(
        `WEB_TEST_SHARD_INDEX ${oneBased} is out of range for ${shards.length} shards`,
      );
    }
    return { index: oneBased - 1, shard };
  });
}

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

  return [
    "bun",
    "test",
    ...parallelArgsFor(profile),
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
  const { explicitPaths } = parseExtraArgs(extraArgs);
  const shards =
    profile === "web"
      ? shardTargets(
          targets,
          webSuiteShardCount({
            explicitPathCount: explicitPaths.length,
            envShards: process.env["WEB_TEST_SHARDS"],
          }),
        )
      : [targets];
  let selectedShards: { index: number; shard: string[] }[];
  try {
    selectedShards =
      profile === "web"
        ? selectWebShards(
            shards,
            webSuiteShardIndex({
              envIndex: process.env["WEB_TEST_SHARD_INDEX"],
              shardCount: shards.length,
            }),
          )
        : shards.map((shard, index) => ({ index, shard }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }

  const started = Date.now();
  const spawnEnv =
    profile === "backend-fast" || profile === "scripts-fast"
      ? backendTestSpawnEnv(FAST_MONGO_URI)
      : { ...process.env, TZ: "Etc/UTC", NODE_ENV: "test" };

  for (const { index, shard } of selectedShards) {
    const shardLabel =
      shards.length > 1
        ? `${label} shard ${index + 1}/${shards.length} (${shard.length} files)`
        : label;
    console.log(`Running ${shardLabel}...`);

    const proc = Bun.spawn(
      testArgvFor(profile, {
        preloadPath,
        bunFlags,
        targets: shard,
      }),
      {
        env: spawnEnv,
        stdout: "inherit",
        stderr: "inherit",
      },
    );
    const stopGuard = guardRss(proc, shardLabel);
    const code = await proc.exited;
    stopGuard();
    if (code !== 0) {
      console.log(`\n${shardLabel}: finished in ${formatDuration(started)}s`);
      process.exit(code ?? 1);
    }
  }

  console.log(`\n${label}: finished in ${formatDuration(started)}s`);
}

if (import.meta.main) {
  await runCli();
}
