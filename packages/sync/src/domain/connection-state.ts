import {
  type ConnectionState,
  type ConnectionStateReason,
} from "@core/types/sync/connection.contracts";

// The single source of truth for a connection's user-facing state. It is a PURE
// function of persisted evidence — no repository or adapter may set "healthy"
// (or any state) directly. Health is earned: valid authority, no overdue
// required work, and a recently verified path.

// Work overdue by at least this long stops a connection from looking healthy
// when recent provider errors are the cause — surface breakage quickly.
export const DELAYED_THRESHOLD_MS = 2 * 60 * 1000;
// Plain backlog (no recent provider errors) uses a longer band so a normally
// draining restart queue reports catchingUp rather than delayed, and a user
// Refresh click does not trip its own warning two minutes later. Matches
// BOOTSTRAP_STALLED_AFTER_MS. See the 2026-08-07 Refresh starvation incident.
export const BACKLOG_DELAYED_THRESHOLD_MS = 15 * 60 * 1000;
// An active calendar still bootstrapping after this long since it last
// advanced is delayed rather than perpetually "importing", even with no
// retrying/overdue job to point to (a chain that keeps settling every job
// "done" - e.g. the unsupported-watch loop this guards against - never trips
// the oldestDueWorkAt check above, since nothing is ever actually overdue).
// Same threshold and the same `updatedAt`-staleness basis as the
// bootstrap-recovery sweep (app.ts) that re-enters a resource stuck here - a
// resource whose chain is genuinely alive keeps advancing updatedAt, so this
// and the sweep now agree on exactly which resources are stuck, instead of
// each answering "is this stalled?" on a different clock (createdAt at 20m
// here vs. updatedAt at 15m there could disagree on a resource the sweep had
// already re-entered while this still called it merely importing).
export const BOOTSTRAP_STALLED_AFTER_MS = 15 * 60 * 1000;

export type CredentialState =
  | "valid"
  | "revoked"
  | "expired"
  | "insufficientScopes";

export interface ConnectionStateEvidence {
  // The user ended this connection; nothing else matters.
  readonly disconnectedAt: Date | null;
  readonly credential: CredentialState;
  // At least one ACTIVE calendar's event reads are durably rejected, OR the
  // connection's calendarList discovery was durably rejected (see the
  // readFailed / discoveryFailed settlements in sync-job-dispatch). Those jobs
  // are settled as drops rather than left retrying, so no overdue-work signal
  // remains to notice — without this, a connection whose primary calendar or
  // account-level discovery had been dead for days still reported healthy,
  // every other signal green (2026-07-30 / 2026-08-08).
  readonly durableReadFailure: boolean;
  // The provider account identity has been resolved.
  readonly accountIdentified: boolean;
  // The first import, watch setup, and post-watch catch-up have finished.
  readonly initialImportComplete: boolean;
  // An active calendar has been mid-bootstrap and untouched (no advancing
  // updatedAt) for longer than BOOTSTRAP_STALLED_AFTER_MS. Only consulted when
  // initialImportComplete is false.
  readonly bootstrapOverdue: boolean;
  // A non-destructive repair, calendar-list discovery, import, or post-gap
  // reconciliation is running while existing data stays queryable. Routine
  // incremental pulls are not included: a foreground tick enqueues one on an
  // already-healthy connection, and treating it as catching up republishes
  // the connection on every tick.
  readonly catchingUp: boolean;
  // The oldest piece of due-but-incomplete work, or null when none is overdue.
  readonly oldestDueWorkAt: Date | null;
  // Recent provider errors are the cause of overdue work (vs. plain backlog).
  readonly recentProviderErrors: boolean;
}

export interface DerivedConnectionState {
  readonly state: ConnectionState;
  // Present only for delayed and actionRequired; null otherwise.
  readonly reason: ConnectionStateReason | null;
}

const CREDENTIAL_REASON: Record<
  Exclude<CredentialState, "valid">,
  ConnectionStateReason
> = {
  revoked: "authorizationRevoked",
  expired: "authorizationExpired",
  insufficientScopes: "insufficientScopes",
};

// Priority order matters: earlier conditions dominate later ones. A revoked
// credential is action-required even mid-import; a disconnected connection is
// disconnected regardless of anything else.
export function deriveConnectionState(
  evidence: ConnectionStateEvidence,
  now: Date,
): DerivedConnectionState {
  if (evidence.disconnectedAt) {
    return { state: "disconnected", reason: null };
  }

  if (evidence.credential !== "valid") {
    return {
      state: "actionRequired",
      reason: CREDENTIAL_REASON[evidence.credential],
    };
  }

  // Ranked above connecting/importing deliberately: a calendar the provider
  // durably refuses to read never earns a cursor, so the import-complete test
  // below can never pass and the connection would otherwise sit on "importing"
  // forever. Delayed/providerErrors says the true thing in both cases — the
  // never-imported one and the imported-then-broken one.
  if (evidence.durableReadFailure) {
    return { state: "delayed", reason: "providerErrors" };
  }

  if (!evidence.accountIdentified) {
    return { state: "connecting", reason: null };
  }

  // Do not let a failed or overdue bootstrap hide behind a perpetual
  // "importing"/"syncing" message. Provider-error backlog alarms quickly;
  // plain backlog waits longer so a draining restart queue stays catchingUp.
  // Terminal failed jobs are immediately overdue (runAfter is in the past).
  if (
    isOverdue(
      evidence.oldestDueWorkAt,
      now,
      evidence.recentProviderErrors
        ? DELAYED_THRESHOLD_MS
        : BACKLOG_DELAYED_THRESHOLD_MS,
    )
  ) {
    return {
      state: "delayed",
      reason: evidence.recentProviderErrors ? "providerErrors" : "workOverdue",
    };
  }

  if (!evidence.initialImportComplete) {
    // Same reasoning as the durableReadFailure branch above, for a bootstrap
    // that is technically still "in progress" by job-retry bookkeeping (every
    // job keeps settling "done") but has made no real progress in ages - don't
    // let that hide behind a perpetual "importing" message either.
    if (evidence.bootstrapOverdue) {
      return { state: "delayed", reason: "workOverdue" };
    }
    return { state: "importing", reason: null };
  }

  if (evidence.catchingUp) {
    return { state: "catchingUp", reason: null };
  }

  return { state: "healthy", reason: null };
}

function isOverdue(
  oldestDueWorkAt: Date | null,
  now: Date,
  thresholdMs: number,
): boolean {
  if (!oldestDueWorkAt) return false;
  return now.getTime() - oldestDueWorkAt.getTime() >= thresholdMs;
}
