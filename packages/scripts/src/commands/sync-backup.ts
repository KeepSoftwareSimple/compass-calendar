#!/usr/bin/env bun
/**
 * Dump the isolated Sync Mongo database (`compass_sync`) for restore drills.
 *
 * Usage:
 *   bun packages/scripts/src/commands/sync-backup.ts [--out DIR]
 *
 * Requires mongodump on PATH and SYNC_MONGO_URI (or compass.yaml `sync.mongoUri`).
 * Does not dump the Compass API database.
 */
import { resolveSyncMongoUri } from "@scripts/common/sync-mongo-uri";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function outDir(argv: string[]): string {
  const flag = argv.indexOf("--out");
  if (flag >= 0 && argv[flag + 1]) return argv[flag + 1]!;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(process.cwd(), "tmp", "sync-backups", stamp);
}

function main(): void {
  const uri = resolveSyncMongoUri("backing up");
  const dest = outDir(process.argv.slice(2));
  mkdirSync(dest, { recursive: true });

  const result = spawnSync("mongodump", ["--uri", uri, "--out", dest], {
    stdio: "inherit",
  });
  if (result.error) {
    console.error(
      "mongodump failed to start. Install MongoDB Database Tools and retry.",
    );
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  console.log(`Sync database dump written to ${dest}`);
  console.log(
    "Restore with: bun packages/scripts/src/commands/sync-restore.ts --from <dump-dir>",
  );
}

main();
