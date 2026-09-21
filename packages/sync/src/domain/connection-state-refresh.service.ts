import { hasStoredOauthRefreshToken } from "@sync/credentials/oauth-refresh-at-rest";
import { MAX_REFRESH_FAILED_ATTEMPTS } from "@sync/credentials/refresh-failure.constants";
import {
  BOOTSTRAP_STALLED_AFTER_MS,
  type ConnectionStateEvidence,
  type CredentialState,
  deriveConnectionState,
} from "@sync/domain/connection-state";
import { type JobRecord } from "@sync/storage/contracts/job.contracts";
import { type ProviderConnectionRecord } from "@sync/storage/contracts/provider-connection.contracts";
import { type CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { type InvalidationRepository } from "@sync/storage/repositories/invalidation.repository";
import { type JobRepository } from "@sync/storage/repositories/job.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export interface ConnectionStateRefreshDeps {
  connections: ProviderConnectionRepository;
  calendars: ProviderCalendarRepository;
  resources: SyncResourceRepository;
  credentials: CredentialRepository;
  jobs: JobRepository;
  // Optional: job-settle supplies the outbox so UI clients learn about state
  // changes. The HTTP list path omits it so a metadata poll cannot enqueue the
  // next SSE refetch.
  invalidations?: InvalidationRepository;
}

// Re-derive a connection's user-facing state from live evidence and persist it.
// Stored state at OAuth link time is always "importing"; without this refresh
// the UI stays on "Syncing calendar" forever after the import chain finishes.
export async function refreshConnectionState(
  deps: ConnectionStateRefreshDeps,
  connection: ProviderConnectionRecord,
  now: () => Date = () => new Date(),
): Promise<ProviderConnectionRecord> {
  const at = now();
  const evidence = await gatherConnectionStateEvidence(deps, connection, at);
  const derived = deriveConnectionState(evidence, at);

  const lastSyncedAt = evidence.lastSyncedAt;
  const lastHealthyAt =
    derived.state === "healthy"
      ? (connection.lastHealthyAt ?? at)
      : connection.lastHealthyAt;

  const stateChanged =
    connection.state !== derived.state ||
    connection.stateReason !== derived.reason;

  if (
    !stateChanged &&
    sameDate(connection.lastSyncedAt, lastSyncedAt) &&
    sameDate(connection.lastHealthyAt, lastHealthyAt)
  ) {
    return connection;
  }

  const updated = await deps.connections.updateDerivedState(
    connection.tenantId,
    connection.principalId,
    connection._id,
    {
      state: derived.state,
      stateReason: derived.reason,
      lastSyncedAt,
      lastHealthyAt,
    },
    at,
  );

  // lastSuccessAt (and therefore lastSyncedAt) moves on every incremental
  // pass, including idle focus refreshes. The SSE bridge turns a connection
  // invalidation into eventsChanged, so publishing that tick refetches ranges
  // that did not change. Wake clients only when the user-visible state or
  // reason actually changes.
  if (deps.invalidations && stateChanged) {
    await deps.invalidations.append({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      invalidation: {
        kind: "connection",
        connectionId: connection._id,
      },
      emittedAt: at,
    });
  }

  return updated;
}

export async function gatherConnectionStateEvidence(
  deps: ConnectionStateRefreshDeps,
  connection: ProviderConnectionRecord,
  now: Date,
): Promise<ConnectionStateEvidence & { lastSyncedAt: Date | null }> {
  const [credential, calendars, resources, oldestOverdue, catchingUp] =
    await Promise.all([
      deps.credentials.findByConnection(connection._id),
      deps.calendars.listByConnection(
        connection.tenantId,
        connection.principalId,
        connection._id,
      ),
      deps.resources.listByConnection(
        connection.tenantId,
        connection.principalId,
        connection._id,
      ),
      deps.jobs.findOldestOverdueByConnection(
        connection.tenantId,
        connection.principalId,
        connection._id,
        now,
      ),
      deps.jobs.hasOutstandingReadWorkByConnection(
        connection.tenantId,
        connection.principalId,
        connection._id,
      ),
    ]);

  const activeCalendars = calendars.filter((c) => c.active);
  const eventsByCalendar = new Map(
    resources
      .filter((r) => r.resourceKind === "events" && r.calendarId)
      .map((r) => [r.calendarId as string, r]),
  );
  const calendarList = resources.find((r) => r.resourceKind === "calendarList");
  const discoveryDone = calendarList?.lastSuccessAt != null;
  const allActiveBootstrapReady =
    activeCalendars.length === 0 ||
    activeCalendars.every((c) => {
      const resource = eventsByCalendar.get(c._id);
      return (
        resource?.syncCursor != null && resource.bootstrapState === "ready"
      );
    });
  // Same basis as the bootstrap-recovery sweep's own staleness check
  // (listStalledBootstraps): time since the resource last advanced, not since
  // it was created, so a resource whose chain is genuinely alive never trips
  // this just for taking a while.
  const bootstrapOverdue = activeCalendars.some((c) => {
    const resource = eventsByCalendar.get(c._id);
    if (resource?.bootstrapState === "ready") return false;
    // An active calendar with no events resource used to skip this check
    // entirely and stay "importing" forever. Fall back to the calendar row's
    // own updatedAt so a missing resource still trips delayed after the stall
    // window; Refresh then re-runs calendar-list discovery to heal it.
    const basis = resource?.updatedAt ?? c.updatedAt;
    return now.getTime() - basis.getTime() >= BOOTSTRAP_STALLED_AFTER_MS;
  });

  // "Last synced" must be as old as the least-recent active calendar. Taking
  // the newest success would let one busy calendar say "just now" while a
  // second visible calendar is stale. No active calendars fall back to the
  // calendar-list pass, which is the only provider data remaining to sync.
  const activeEventSuccessAts = activeCalendars.map(
    (calendar) => eventsByCalendar.get(calendar._id)?.lastSuccessAt ?? null,
  );
  const lastSyncedAt =
    activeEventSuccessAts.length === 0
      ? (calendarList?.lastSuccessAt ?? null)
      : activeEventSuccessAts.every((at) => at instanceof Date)
        ? minDate(...activeEventSuccessAts)
        : null;

  return {
    disconnectedAt: connection.disconnectedAt,
    credential: credentialState(credential),
    // Connection-wide calendarList discovery failure OR an ACTIVE calendar's
    // event-read failure. A deactivated calendar's stale marker is not a
    // problem the user can act on, and its jobs are dropped anyway.
    durableReadFailure:
      calendarList?.lastReadFailureAt != null ||
      activeCalendars.some(
        (c) => eventsByCalendar.get(c._id)?.lastReadFailureAt != null,
      ),
    accountIdentified: Boolean(connection.account.providerAccountId),
    // Discovery must have finished, and every currently-active calendar must
    // have a cursor plus a successful post-watch catch-up pull. A cursor alone
    // has a gap between the import and the provider watch registration.
    initialImportComplete: discoveryDone && allActiveBootstrapReady,
    bootstrapOverdue,
    catchingUp,
    oldestDueWorkAt: oldestOverdue?.runAfter ?? null,
    // A job that used up its retry ladder on retryableTransient failures is
    // itself provider-error evidence, distinct from a plain backlog.
    recentProviderErrors: oldestOverdue?.failureClass === "retryableTransient",
    lastSyncedAt,
  };
}

function credentialState(
  credential: Awaited<ReturnType<CredentialRepository["findByConnection"]>>,
): CredentialState {
  if (!credential) return "revoked";
  if (credential.credentialKind === "password") return "valid";
  if (!hasStoredOauthRefreshToken(credential)) return "revoked";
  if (credential.refreshFailureCount >= MAX_REFRESH_FAILED_ATTEMPTS) {
    return "expired";
  }
  return "valid";
}

// Re-derive health after a job drop, retry, or terminal fail so the SPA is
// not stuck on "importing" / "healthy" until the next metadata poll.
export async function refreshConnectionStateAfterJob(
  deps: ConnectionStateRefreshDeps & {
    log?: { warn: (message: string) => void };
  },
  job: Pick<JobRecord, "tenantId" | "principalId" | "connectionId">,
  now?: () => Date,
): Promise<void> {
  try {
    const connection = await deps.connections.findById(
      job.tenantId,
      job.principalId,
      job.connectionId,
    );
    if (!connection) return;
    await refreshConnectionState(deps, connection, now);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    deps.log?.warn(
      `Failed to refresh connection state for connection ${job.connectionId}: ${detail}`,
    );
  }
}

function minDate(...dates: Array<Date | null | undefined>): Date | null {
  let min: Date | null = null;
  for (const d of dates) {
    if (!(d instanceof Date)) continue;
    if (!min || d.getTime() < min.getTime()) min = d;
  }
  return min;
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}
