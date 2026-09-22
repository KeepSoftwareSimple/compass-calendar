#!/usr/bin/env bun
/**
 * Restore a Sync Mongo dump produced by sync-backup.ts.
 *
 * Usage:
 *   bun packages/scripts/src/commands/sync-restore.ts --from DIR [--drop]
 *
 * `--drop` drops each collection before restore (typical for a drill onto an
 * empty/throwaway Sync database). Never point this at production without an
 * explicit maintenance window.
 */
import { resolveSyncMongoUri } from "@scripts/common/sync-mongo-uri";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function fromDir(argv: string[]): string {
  const flag = argv.indexOf("--from");
  if (flag < 0 || !argv[flag + 1]) {
    throw new Error("Required: --from <mongodump-output-dir>");
  }
  return argv[flag + 1]!;
}

function main(): void {
  const argv = process.argv.slice(2);
  const uri = resolveSyncMongoUri("restoring");
  const source = fromDir(argv);
  if (!existsSync(source)) {
    throw new Error(`Dump directory not found: ${source}`);
  }
  const drop = argv.includes("--drop");

  const args = ["--uri", uri, `--dir=${source}`];
  if (drop) args.push("--drop");

  const result = spawnSync("mongorestore", args, { stdio: "inherit" });
  if (result.error) {
    console.error(
      "mongorestore failed to start. Install MongoDB Database Tools and retry.",
    );
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log(`Sync database restored from ${source}`);
}

main();
