import {
  BACKEND_PORT_BASE,
  type DevPorts,
  isPortFree,
  siblingConfigPaths,
  WEB_PORT_BASE,
} from "@scripts/commands/dev-ports-shared";
import {
  ensureSyncConfigFile,
  readSyncPort,
} from "@scripts/commands/ensure-sync-config";
import { parse, parseDocument } from "yaml";
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Preflight for `bun run dev:web` / `bun run dev:backend`.
 *
 * Every git worktree gets its own gitignored compass.yaml, and they all
 * default to the same ports (web 9080, backend 3000), so the second worktree
 * to start a dev server crashes with EADDRINUSE. This script assigns each
 * worktree its own port pair once, at config level, keeping web.url,
 * backend.apiUrl, and originsAllowed consistent — so the app code never has
 * to care that ports differ between worktrees.
 *
 * Conflicts are detected from sibling worktrees' compass.yaml files (not live
 * sockets), which makes reruns no-ops even while this worktree's own servers
 * are running. If dev:web and dev:backend preflight simultaneously in a fresh
 * worktree, both compute the same answer from the same sibling claims; the
 * double write is harmless.
 *
 * Once mongo.uri is present, this also completes a missing sync: block via
 * ensure-sync-config.ts — see that file for what's derived and why. Its
 * candidate port range overlaps this file's BACKEND_PORT_BASE range, so
 * findNextPorts here and findNextSyncPort there each exclude the other's
 * claims.
 */

export { BACKEND_PORT_BASE, type DevPorts, WEB_PORT_BASE };

// Which dev server is launching, so the port-in-use warning only covers the
// service that's actually about to bind. Port reassignment stays pair-based.
export type Scope = "web" | "backend";

export function readPorts(yamlText: string): DevPorts | null {
  try {
    const config = parse(yamlText) as {
      web?: { port?: string | number };
      backend?: { port?: string | number };
    };
    return {
      web: Number(config?.web?.port) || WEB_PORT_BASE,
      backend: Number(config?.backend?.port) || BACKEND_PORT_BASE,
    };
  } catch {
    return null;
  }
}

/**
 * Rewrites the port-derived fields of a compass.yaml document, preserving
 * comments, formatting, and everything else (secrets included). Returns null
 * when web.url/backend.apiUrl don't match the plain localhost pattern (e.g.
 * a cloudflare tunnel or real domain) — those setups manage ports manually.
 */
export function reassignPorts(yamlText: string, next: DevPorts): string | null {
  const current = readPorts(yamlText);
  if (!current) return null;

  const doc = parseDocument(yamlText);
  const webUrl = doc.getIn(["web", "url"]);
  const apiUrl = doc.getIn(["backend", "apiUrl"]);

  if (
    webUrl !== `http://localhost:${current.web}` ||
    apiUrl !== `http://localhost:${current.backend}/api`
  ) {
    return null;
  }

  doc.setIn(["web", "port"], next.web);
  doc.setIn(["web", "url"], `http://localhost:${next.web}`);
  doc.setIn(["backend", "port"], next.backend);
  doc.setIn(["backend", "apiUrl"], `http://localhost:${next.backend}/api`);

  const origins = doc.getIn(["backend", "originsAllowed"]);
  if (Array.isArray((origins as { items?: unknown[] })?.items)) {
    const oldToNew: Record<string, string> = {
      [`http://localhost:${current.web}`]: `http://localhost:${next.web}`,
      [`http://localhost:${current.backend}`]: `http://localhost:${next.backend}`,
    };
    const rewritten = ((origins as { toJSON(): string[] }).toJSON() ?? []).map(
      (origin) => oldToNew[origin] ?? origin,
    );
    doc.setIn(["backend", "originsAllowed"], rewritten);
  }

  return doc.toString();
}

// One sibling worktree's port claims, read from its compass.yaml.
export interface SiblingClaim {
  worktree: string;
  ports: DevPorts;
  syncPort: number | null;
}

function readSiblingClaims(root: string): SiblingClaim[] {
  return siblingConfigPaths(root).flatMap((file) => {
    const yamlText = readFileSync(file, "utf8");
    const ports = readPorts(yamlText);
    if (!ports) return [];
    return [
      { worktree: path.dirname(file), ports, syncPort: readSyncPort(yamlText) },
    ];
  });
}

function ensureConfigExists(root: string, configPath: string): void {
  if (existsSync(configPath)) return;

  const source =
    siblingConfigPaths(root)[0] ?? path.join(root, "compass.example.yaml");

  copyFileSync(source, configPath);
  console.log(`[dev-ports] created compass.yaml from ${source}`);
}

function isPortsClaimed(ports: DevPorts, claimed: DevPorts[]): boolean {
  return claimed.some(
    (c) => c.web === ports.web || c.backend === ports.backend,
  );
}

type IsPortFree = (port: number) => Promise<boolean>;

// Smallest offset whose web/backend pair is unclaimed by any of `claims` and
// actually free on the OS, or null if none of the first 50 offsets work out.
// Sync ports count as claims too: the sync range overlaps the backend range
// (see the module doc), so this is the reverse half of the same guard
// ensureSyncConfigFile applies for backend ports.
async function searchPorts(
  claims: SiblingClaim[],
  isFree: IsPortFree,
): Promise<DevPorts | null> {
  const claimed = claims.map((c) => c.ports);
  const syncPorts = claims.map((c) => c.syncPort);
  for (let offset = 1; offset <= 50; offset++) {
    const candidate: DevPorts = {
      web: WEB_PORT_BASE + offset,
      backend: BACKEND_PORT_BASE + offset,
    };
    if (isPortsClaimed(candidate, claimed)) continue;
    if (syncPorts.includes(candidate.backend)) continue;
    if ((await isFree(candidate.web)) && (await isFree(candidate.backend))) {
      return candidate;
    }
  }
  return null;
}

// Claims whose web, backend, or sync port is actually bound right now.
export async function liveClaims(
  claims: SiblingClaim[],
  isFree: IsPortFree = isPortFree,
): Promise<SiblingClaim[]> {
  const live: SiblingClaim[] = [];
  for (const claim of claims) {
    const ports = [claim.ports.web, claim.ports.backend, claim.syncPort];
    for (const port of ports) {
      if (port !== null && !(await isFree(port))) {
        live.push(claim);
        break;
      }
    }
  }
  return live;
}

// Every worktree that ever ran dev:* keeps its compass.yaml claim forever,
// and each one can use up to two slots of the backend range (backend + sync),
// so a few dozen idle worktrees exhaust all 50 offsets. Respect every claim
// first; if that finds nothing, retry counting only claims that are live.
export async function findNextPorts(
  claims: SiblingClaim[],
  isFree: IsPortFree = isPortFree,
): Promise<DevPorts | null> {
  return (
    (await searchPorts(claims, isFree)) ??
    searchPorts(await liveClaims(claims, isFree), isFree)
  );
}

export function describeExhaustedPorts(live: SiblingClaim[]): string {
  const holders = live.map(
    (c) =>
      `  ${c.worktree} (web ${c.ports.web}, backend ${c.ports.backend}` +
      `${c.syncPort === null ? "" : `, sync ${c.syncPort}`})`,
  );
  return [
    "[dev-ports] no free port pair found within 50 offsets.",
    holders.length > 0
      ? "Running worktrees holding claims:"
      : "No sibling worktree is running; the ports are bound by other processes.",
    ...holders,
  ].join("\n");
}

// Best-effort: PIDs listening on the given TCP port, or [] if none (or if
// lsof isn't available). Sibling-config detection can't see a stale process
// still bound to this worktree's own port, so we probe the live socket only
// to print a friendlier warning than the raw EADDRINUSE stack trace the dev
// server would otherwise throw.
function portHolders(port: number): string[] {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return []; // no holder (lsof exits non-zero) or lsof unavailable
  }
}

// `scope` limits the check to the service actually being launched, so
// `dev:backend` doesn't warn about a web server legitimately running on 9080
// (and vice versa). Omitted → check both.
function warnIfPortsHeld(ports: DevPorts, scope?: Scope): void {
  for (const [label, port] of [
    ["web", ports.web],
    ["backend", ports.backend],
  ] as const) {
    if (scope && label !== scope) continue;
    const pids = portHolders(port);
    if (pids.length > 0) {
      console.log(
        `[dev-ports] warning: ${label} port ${port} is already in use by ` +
          `PID ${pids.join(", ")}. The dev server will fail to bind. ` +
          `Free it with: kill ${pids.join(" ")}`,
      );
    }
  }
}

async function main(scope?: Scope): Promise<void> {
  const root = process.cwd();
  const configPath = path.join(root, "compass.yaml");

  try {
    ensureConfigExists(root, configPath);
  } catch {
    return; // not a git repo or no template — nothing to manage
  }

  const yamlText = readFileSync(configPath, "utf8");
  const current = readPorts(yamlText);
  if (!current) return;

  const claims = readSiblingClaims(root);
  const claimed = claims.map((c) => c.ports);
  if (!isPortsClaimed(current, claimed)) {
    warnIfPortsHeld(current, scope);
    await ensureSyncConfigFile(root, configPath, claimed);
    return;
  }

  const next = await findNextPorts(claims);
  if (!next) {
    throw new Error(describeExhaustedPorts(await liveClaims(claims)));
  }

  const rewritten = reassignPorts(yamlText, next);
  if (rewritten === null) {
    console.log(
      "[dev-ports] compass.yaml uses custom URLs — manage ports manually",
    );
    warnIfPortsHeld(current, scope);
    await ensureSyncConfigFile(root, configPath, claimed);
    return;
  }

  writeFileSync(configPath, rewritten);
  console.log(
    `[dev-ports] ports ${current.web}/${current.backend} are claimed by ` +
      `another worktree — reassigned to web ${next.web}, backend ${next.backend}`,
  );
  await ensureSyncConfigFile(root, configPath, claimed);
}

if (require.main === module) {
  const arg = process.argv[2];
  const scope: Scope | undefined =
    arg === "web" || arg === "backend" ? arg : undefined;
  main(scope).catch((err) => {
    console.log(err);
    process.exit(1);
  });
}
