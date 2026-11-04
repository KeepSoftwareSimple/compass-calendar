import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";

/**
 * Primitives shared between dev-ports.ts (web/backend port assignment) and
 * ensure-sync-config.ts (sync: block synthesis) — split out so neither of
 * those two files needs to import the other.
 */

export const WEB_PORT_BASE = 9080;
export const BACKEND_PORT_BASE = 3000;

export interface DevPorts {
  web: number;
  backend: number;
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.unref();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen({ port, host: "0.0.0.0" });
  });
}

// Parses `git worktree list --porcelain`, skipping entries git marks
// `prunable` (their directory is gone; git just hasn't pruned the record).
export function parseWorktreeList(output: string): string[] {
  return output
    .split(/\n\s*\n/)
    .filter((block) => !/^prunable\b/m.test(block))
    .map((block) => block.match(/^worktree (.+)$/m)?.[1])
    .filter((worktree): worktree is string => Boolean(worktree));
}

function listWorktreePaths(): string[] {
  return parseWorktreeList(
    execSync("git worktree list --porcelain", { encoding: "utf8" }),
  );
}

export function siblingConfigPaths(root: string): string[] {
  return listWorktreePaths()
    .filter((worktree) => path.resolve(worktree) !== path.resolve(root))
    .map((worktree) => path.join(worktree, "compass.yaml"))
    .filter(existsSync);
}
