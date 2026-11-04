import {
  BACKEND_PORT_BASE,
  type DevPorts,
  isPortFree,
  siblingConfigPaths,
  WEB_PORT_BASE,
} from "@scripts/commands/dev-ports-shared";
import { parse, parseDocument } from "yaml";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Completes a compass.yaml's sync: block once mongo.uri is present (the
 * worktree can already run dev:backend for the main app) — see
 * ensureSyncConfigFile. None of these fields need a value from outside this
 * worktree's own config: internalAuthToken is a shared secret two
 * locally-run processes compare only to themselves, serviceUrl/
 * callbackBaseUrl are just this worktree's own sync port, and mongoUri
 * reuses mongo.uri's host/credentials against an isolated database name
 * (the pattern self-host/compass.example.yaml documents for reusing root
 * credentials against compass_sync).
 *
 * SYNC_PORT_BASE (3010) sits inside BACKEND_PORT_BASE's own candidate range
 * — matching the 3010 convention baked into self-host's docker network,
 * deploy config, and the sync package's own default, so moving it would
 * ripple far outside this file. dev-ports.ts's findNextPorts and this
 * file's findNextSyncPort each exclude the other's claimed ports instead
 * (see the comment above `claimed` in ensureSyncConfigFile).
 */

export const SYNC_PORT_BASE = 3010;
const SYNC_DATABASE_NAME = "compass_sync";

// null means no sync.port is actually configured — distinct from "configured
// to SYNC_PORT_BASE", so an unconfigured sibling (the common case; sync: is
// nullish until mongo.uri is present) doesn't falsely read as claiming the
// default port to every other worktree's conflict check.
export function readSyncPort(yamlText: string): number | null {
  try {
    const config = parse(yamlText) as { sync?: { port?: string | number } };
    const port = Number(config?.sync?.port);
    return port > 0 ? port : null;
  } catch {
    return null;
  }
}

/**
 * Same host/credentials as mongoUri, database segment swapped for an
 * isolated one — the reuse pattern self-host/compass.example.yaml documents
 * for mongoUri. Returns null for a shape this can't confidently rewrite
 * (leaves sync: unconfigured rather than writing something wrong).
 */
export function deriveSyncMongoUri(mongoUri: string): string | null {
  const match = mongoUri.match(/^(mongodb(?:\+srv)?:\/\/[^/]+\/)[^/?]*(.*)$/);
  if (!match) return null;
  const [, prefix, suffix] = match;
  return `${prefix}${SYNC_DATABASE_NAME}${suffix}`;
}

function randomToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Fills in a missing sync: block from values already in this same config
 * (mongoUri) or freely synthesizable locally (internalAuthToken is only
 * ever compared to itself; serviceUrl/callbackBaseUrl are localhost URLs
 * derived from the assigned port) — never fetched from anywhere external.
 * Returns null when sync.mongoUri is already present (nothing to do) or
 * mongo.uri is absent or unrecognizable (nothing to derive from).
 */
export function ensureSyncConfig(
  yamlText: string,
  syncPort: number,
  webUrl: string,
): string | null {
  const doc = parseDocument(yamlText);
  if (doc.getIn(["sync", "mongoUri"])) return null;

  const mongoUri = doc.getIn(["mongo", "uri"]);
  if (typeof mongoUri !== "string") return null;

  const syncMongoUri = deriveSyncMongoUri(mongoUri);
  if (!syncMongoUri) return null;

  const base = `http://localhost:${syncPort}`;
  doc.setIn(["sync", "port"], syncPort);
  doc.setIn(["sync", "mongoUri"], syncMongoUri);
  if (!doc.getIn(["sync", "internalAuthToken"])) {
    doc.setIn(["sync", "internalAuthToken"], randomToken());
  }
  doc.setIn(["sync", "serviceUrl"], base);
  doc.setIn(["sync", "callbackBaseUrl"], base);
  doc.setIn(["sync", "postConnectRedirectUrl"], webUrl);

  return doc.toString();
}

function readSiblingSyncPorts(root: string): number[] {
  return siblingConfigPaths(root)
    .map((file) => readSyncPort(readFileSync(file, "utf8")))
    .filter((port): port is number => port !== null);
}

// Unlike dev-ports.ts's findNextPorts, this searches from the base itself
// (offset 0): most worktrees have never had a sync port assigned, so the
// base is usually free, whereas web/backend only call their search once
// the base is already known to be claimed.
async function findNextSyncPort(claimed: number[]): Promise<number | null> {
  for (let offset = 0; offset <= 50; offset++) {
    const candidate = SYNC_PORT_BASE + offset;
    if (claimed.includes(candidate)) continue;
    if (await isPortFree(candidate)) return candidate;
  }
  return null;
}

// Runs independently of (and after) dev-ports.ts's web/backend port logic,
// since a worktree can need sync completed whether or not its web/backend
// ports just changed. No-ops for a worktree with no mongo.uri yet
// (frontend-only) or one whose sync: block is already complete. Takes the
// sibling web/backend claims dev-ports.ts's main() already computed rather
// than re-deriving them — with dozens of sibling worktrees, that's a
// repeated `git worktree list` subprocess and a second parse of every
// sibling's compass.yaml for no new information.
export async function ensureSyncConfigFile(
  root: string,
  configPath: string,
  siblingPorts: DevPorts[],
): Promise<void> {
  const yamlText = readFileSync(configPath, "utf8");
  const parsed = parse(yamlText) as {
    web?: { url?: string };
    backend?: { port?: string | number };
    sync?: { mongoUri?: string };
    mongo?: { uri?: string };
  };
  if (parsed?.sync?.mongoUri) return;
  if (!parsed?.mongo?.uri) return;

  // Sync's candidate range (SYNC_PORT_BASE + 0..50) overlaps backend's
  // (BACKEND_PORT_BASE + 0..50): a sibling sync.port claim alone can't stop
  // a candidate from colliding with a worktree's (this one's or a
  // sibling's) already-assigned backend.port, so that pool is claimed too.
  const claimed = [
    ...readSiblingSyncPorts(root),
    ...siblingPorts.map((p) => p.backend),
    Number(parsed.backend?.port) || BACKEND_PORT_BASE,
  ];
  const syncPort = await findNextSyncPort(claimed);
  if (!syncPort) {
    console.log(
      "[dev-ports] no free sync port found within 50 offsets — leaving sync: unconfigured",
    );
    return;
  }

  const webUrl = parsed.web?.url ?? `http://localhost:${WEB_PORT_BASE}`;
  const rewritten = ensureSyncConfig(yamlText, syncPort, webUrl);
  if (rewritten === null) {
    console.log(
      "[dev-ports] could not derive sync.mongoUri from mongo.uri — leaving sync: unconfigured",
    );
    return;
  }

  writeFileSync(configPath, rewritten);
  console.log(
    `[dev-ports] filled in sync: config (port ${syncPort}) from mongo.uri`,
  );
}
