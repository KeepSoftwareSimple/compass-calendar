import { ObjectId } from "mongodb";
import {
  CHANGE_FEED_PAGE_SIZE,
  type ChangeFeedCursor,
  ChangeFeedCursorSchema,
  type ChangeFeedResponse,
  type GlobalChangeFeedResponse,
  type GlobalInvalidationEnvelope,
  type InvalidationEnvelope,
} from "@core/types/sync/change-feed.contracts";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  INVALIDATION_RETENTION_MS,
  type InvalidationRepository,
} from "@sync/storage/repositories/invalidation.repository";

export interface ChangeFeedDeps {
  invalidations: InvalidationRepository;
}

type FeedPage<TEnvelope> =
  | { kind: "resyncRequired" }
  | { kind: "ok"; invalidations: TEnvelope[]; nextCursor: ChangeFeedCursor };

async function readFeedPage<TRow extends { _id: string }, TEnvelope>(
  cursor: string | null,
  at: Date,
  latestId: () => Promise<string | null>,
  listAfter: (cursor: string, limit: number) => Promise<TRow[]>,
  mapRow: (row: TRow) => TEnvelope,
): Promise<FeedPage<TEnvelope>> {
  if (cursor === null) {
    const highWater = await latestId();
    return {
      kind: "ok",
      invalidations: [],
      // Prefer the current high-water mark. Mint only when the outbox is
      // empty so the first append after connect is still after the watermark.
      nextCursor: asCursor(highWater ?? new ObjectId().toHexString()),
    };
  }

  if (isStaleOrMalformed(cursor, at)) {
    return { kind: "resyncRequired" };
  }

  const rows = await listAfter(cursor, CHANGE_FEED_PAGE_SIZE);
  const last = rows.at(-1);
  return {
    kind: "ok",
    invalidations: rows.map(mapRow),
    nextCursor: last ? asCursor(last._id) : asCursor(cursor),
  };
}

// Resume the authenticated principal's content-free invalidation feed.
//
// - null cursor: "from now" — empty page + a fresh ObjectId watermark.
// - valid cursor within retention: keyset page after that id.
// - malformed or older-than-retention cursor: resyncRequired (caller must
//   invalidate cached queries rather than trust a partial replay).
export async function readChangeFeed(
  deps: ChangeFeedDeps,
  tenantId: TenantId,
  principalId: PrincipalId,
  cursor: string | null,
  now: () => Date = () => new Date(),
): Promise<ChangeFeedResponse> {
  return readFeedPage(
    cursor,
    now(),
    () => deps.invalidations.latestId(tenantId, principalId),
    (after, limit) =>
      deps.invalidations.listAfter(tenantId, principalId, after, limit),
    (row): InvalidationEnvelope => ({
      invalidation: row.invalidation,
      emittedAt:
        row.emittedAt.toISOString() as InvalidationEnvelope["emittedAt"],
    }),
  );
}

// Resume the GLOBAL (cross-tenant) content-free invalidation feed — the
// single multiplexed poll the backend runs once per process instead of once
// per connected user (S-multiplex). Same resume semantics as readChangeFeed,
// just unscoped; each envelope carries its own tenantId/principalId so the
// one caller can route to the right user's SSE subscribers.
export async function readGlobalChangeFeed(
  deps: ChangeFeedDeps,
  cursor: string | null,
  now: () => Date = () => new Date(),
): Promise<GlobalChangeFeedResponse> {
  return readFeedPage(
    cursor,
    now(),
    () => deps.invalidations.latestIdGlobal(),
    (after, limit) => deps.invalidations.listAfterGlobal(after, limit),
    (row): GlobalInvalidationEnvelope => ({
      invalidation: row.invalidation,
      emittedAt:
        row.emittedAt.toISOString() as InvalidationEnvelope["emittedAt"],
      tenantId: row.tenantId,
      principalId: row.principalId,
    }),
  );
}

// A resume cursor is unusable either because it is not a well-formed ObjectId
// (a client bug or tampering) or because it points further back than the
// outbox's retention window — either way the caller must resync rather than
// trust what would be a partial replay. Shared by both feeds above.
function isStaleOrMalformed(cursor: string, at: Date): boolean {
  if (!ObjectId.isValid(cursor) || cursor.length !== 24) return true;
  const cursorTime = ObjectId.createFromHexString(cursor).getTimestamp();
  return at.getTime() - cursorTime.getTime() > INVALIDATION_RETENTION_MS;
}

function asCursor(id: string): ChangeFeedCursor {
  return ChangeFeedCursorSchema.parse(id);
}
