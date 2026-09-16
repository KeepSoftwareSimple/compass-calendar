import { Logger } from "@core/logger/winston.logger";
import {
  CHANGE_FEED_PAGE_SIZE,
  type ChangeFeedCursor,
  type GlobalInvalidationEnvelope,
  type SyncInvalidation,
} from "@core/types/sync/change-feed.contracts";
import { type SyncServiceClient } from "@backend/common/services/sync-service/sync-service.client";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { sseServer } from "@backend/servers/sse/sse.server";
import {
  syncInvalidationToServerMessages,
  UNKNOWN_CALENDAR_ID,
} from "@backend/servers/sse/sync-invalidation.to-server-message";
import {
  defaultSchedule,
  type TickScheduler,
} from "@backend/servers/sse/tick-scheduler";

const logger = Logger("app:sse.sync-change-feed");

const POLL_INTERVAL_MS = 2000;
const ERROR_BACKOFF_MS = 5000;

export { CHANGE_FEED_PAGE_SIZE };

export interface SyncChangeFeedBridgeDeps {
  client: Pick<SyncServiceClient, "getGlobalChanges">;
  sse: Pick<
    typeof sseServer,
    | "connectedUserIds"
    | "publish"
    | "publishCalendarsChanged"
    | "publishEventsChanged"
  >;
}

export interface SyncChangeFeedBridgeOptions {
  pollIntervalMs?: number;
  errorBackoffMs?: number;
  // Injectable timer so tests can drive ticks deterministically.
  schedule?: TickScheduler;
}

// Collapse a page to one representative per (principal, kind, calendar or
// connection) so a Sync burst of 100 identical calendar rows becomes one
// calendarsChanged + one eventsChanged, not 200 SSE frames. Later envelopes
// win: the feed is ordered, so the last row in a group is the freshest.
function dedupeInvalidations(
  envelopes: readonly GlobalInvalidationEnvelope[],
): GlobalInvalidationEnvelope[] {
  const groups = new Map<string, GlobalInvalidationEnvelope>();
  for (const envelope of envelopes) {
    groups.set(
      invalidationGroupKey(envelope.principalId, envelope.invalidation),
      envelope,
    );
  }
  return [...groups.values()];
}

function invalidationGroupKey(
  principalId: string,
  invalidation: SyncInvalidation,
): string {
  switch (invalidation.kind) {
    case "event":
    case "calendar":
      return `${principalId}\0${invalidation.kind}\0${invalidation.calendarId}`;
    case "connection":
    case "importProgress":
      return `${principalId}\0${invalidation.kind}\0${invalidation.connectionId}`;
    case "command":
      return `${principalId}\0${invalidation.kind}\0${invalidation.commandId}`;
  }
}

// Polls Sync's single, global (cross-tenant) change feed with ONE shared
// cursor for the life of the process, and fans invalidations out to whichever
// SSE subscribers happen to be locally connected — publish() no-ops for a
// user with none, so nothing here needs to know who is connected before it
// fetches.
//
// This replaces one poller per connected user: O(backend replicas) HTTP
// chatter to Sync instead of O(connected users), and the cursor now survives
// a user's SSE reconnect churn — previously a per-user cursor reset to "now"
// every time that user's last tab closed, silently skipping whatever
// happened in the gap (masked only by the client's initial refetch).
export class SyncChangeFeedBridge {
  readonly #client: SyncChangeFeedBridgeDeps["client"];
  readonly #sse: SyncChangeFeedBridgeDeps["sse"];
  readonly #pollIntervalMs: number;
  readonly #errorBackoffMs: number;
  readonly #schedule: TickScheduler;

  #cursor: ChangeFeedCursor | null = null;
  #stopped = true;
  #timer: { clear: () => void } | null = null;

  constructor(
    deps: SyncChangeFeedBridgeDeps,
    options: SyncChangeFeedBridgeOptions = {},
  ) {
    this.#client = deps.client;
    this.#sse = deps.sse;
    this.#pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.#errorBackoffMs = options.errorBackoffMs ?? ERROR_BACKOFF_MS;
    this.#schedule = options.schedule ?? defaultSchedule;
  }

  // Begin polling. Idempotent: a second call while running is a no-op.
  start(): void {
    if (!this.#stopped) return;
    this.#stopped = false;
    this.#scheduleNext(0);
  }

  // Stop polling. Idempotent and safe to call when never started.
  stop(): void {
    this.#stopped = true;
    this.#timer?.clear();
    this.#timer = null;
  }

  #scheduleNext(delayMs: number): void {
    if (this.#stopped) return;
    this.#timer = this.#schedule(() => void this.#tick(), delayMs);
  }

  async #tick(): Promise<void> {
    if (this.#stopped) return;

    // Everything below can throw: getGlobalChanges rejects on a network
    // fault, and syncInvalidationToServerMessages/JSON.stringify inside
    // publish() throw on a malformed id or payload. Uncaught, either one
    // would fall out of the scheduling chain and silently stop the global
    // poller for the life of the process - every connected user's live
    // updates stop with no signal. Always reschedule, even on failure.
    try {
      await this.#tickUnsafe();
    } catch (error) {
      logger.error(
        `Sync global change-feed tick threw: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? { stack: error.stack } : undefined,
      );
      if (!this.#stopped) this.#scheduleNext(this.#errorBackoffMs);
    }
  }

  async #tickUnsafe(): Promise<void> {
    const result = await this.#client.getGlobalChanges(this.#cursor);
    if (this.#stopped) return;

    if (!result.ok) {
      logger.warn(`Sync global change-feed poll failed: ${result.error.kind}`);
      this.#scheduleNext(this.#errorBackoffMs);
      return;
    }

    const page = result.value;
    if (page.kind === "resyncRequired") {
      // The shared cursor fell outside Sync's retention window. There is no
      // per-user cursor anymore to say who specifically missed something, so
      // every currently-connected user gets the broad invalidate.
      for (const userId of this.#sse.connectedUserIds()) {
        this.#sse.publishCalendarsChanged(userId, []);
        this.#sse.publishEventsChanged(userId, {
          calendarId: UNKNOWN_CALENDAR_ID,
          eventIds: [],
          reason: "reconciled",
        });
      }
      this.#cursor = null;
      this.#scheduleNext(this.#pollIntervalMs);
      return;
    }

    for (const envelope of dedupeInvalidations(page.invalidations)) {
      for (const message of syncInvalidationToServerMessages(
        envelope.invalidation,
      )) {
        this.#sse.publish(envelope.principalId, message);
      }
    }
    this.#cursor = page.nextCursor;
    this.#scheduleNext(
      page.invalidations.length === CHANGE_FEED_PAGE_SIZE
        ? 0
        : this.#pollIntervalMs,
    );
  }
}

// Constructed but NOT started here: this module is imported for its types by
// tests that have no interest in a real, live network poller running for the
// rest of that test process. The real backend process starts it explicitly
// (see app.ts) — the one place import.meta.main gates production bootstrap
// from a test importing the same module.
export const syncChangeFeedBridge = new SyncChangeFeedBridge({
  // Deferred rather than resolved eagerly: getSyncServiceClient() reads
  // global CONFIG, and this singleton is constructed at module import time.
  client: {
    getGlobalChanges: (cursor, correlationId) =>
      getSyncServiceClient().getGlobalChanges(cursor, correlationId),
  },
  sse: sseServer,
});
