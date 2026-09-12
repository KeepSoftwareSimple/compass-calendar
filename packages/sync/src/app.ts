import { startOtelLogs, stopOtelLogs } from "@core/logger/otel-logs";
import {
  captureSafely,
  createPostHogCaptureClient,
  DEFAULT_POSTHOG_HOST,
  type PostHogCaptureClient,
} from "@core/logger/posthog-capture";
import { Logger } from "@core/logger/winston.logger";
import { configureHttpServer } from "@core/server/http-server";
import {
  SYNC_JOB_TERMINAL_FAILURE_EVENT,
  SYNC_RECONCILE_SWEEP_EVENT,
  SyncJobTerminalFailureEventSchema,
  SyncReconcileSweepEventSchema,
} from "@core/types/sync/health.contracts";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import {
  isTransientMongoNetworkError,
  withTransientMongoRetry,
} from "@core/util/mongo-network-error.util";
import {
  createInternalAuthMiddleware,
  createInternalServiceAuthMiddleware,
} from "@sync/auth/internal-auth";
import { loadSyncConfig, type SyncConfig } from "@sync/config/sync.config";
import { CredentialCustody } from "@sync/credentials/credential-custody.service";
import { rediscoverStaleCalendarLists } from "@sync/domain/calendar-list-rediscovery.service";
import {
  CONNECTION_CACHE_RETENTION_MS,
  purgeExpiredDisconnectedConnections,
} from "@sync/domain/connection-retention.service";
import { BOOTSTRAP_STALLED_AFTER_MS } from "@sync/domain/connection-state";
import {
  FAILED_JOB_MAX_REQUEUES,
  requeueFailedJobs,
} from "@sync/domain/failed-job-requeue.service";
import {
  buildReconcileSweepRows,
  listStaleEventsForRow,
} from "@sync/domain/reconcile-sweep-rows";
import { enqueueForResources } from "@sync/domain/resource-sweep-enqueue";
import { retryStaleCommands } from "@sync/domain/stale-command-retry.service";
import { SweepScheduler } from "@sync/domain/sweep-scheduler.service";
import { SyncJobWorker } from "@sync/domain/sync-job-worker.service";
import { SyncScheduler } from "@sync/domain/sync-scheduler.service";
import { ReadinessRegistry } from "@sync/lifecycle/readiness";
import { ShutdownCoordinator } from "@sync/lifecycle/shutdown";
import { deriveOAuthStateSecret } from "@sync/oauth/oauth-state";
import { type ProviderAdapterOverrides } from "@sync/providers/provider-adapters";
import { type ProviderAuthAdapter } from "@sync/providers/provider-auth.port";
import { type ContactsPort } from "@sync/providers/provider-contacts.port";
import { type ProviderEventWriter } from "@sync/providers/provider-event-writer.port";
import {
  buildProviderRegistry,
  type ProviderRegistry,
  resolveAdaptersFrom,
  resolveAuthFrom,
} from "@sync/providers/provider-registry";
import { redactedCause } from "@sync/safety/redact-error";
import { buildSyncApp } from "@sync/server/sync.server";
import { buildServiceIdentity } from "@sync/service-identity";
import {
  type JobRecord,
  resourceJob,
} from "@sync/storage/contracts/job.contracts";
import { SyncMongoService } from "@sync/storage/sync-mongo.service";
import { syncRepositories } from "@sync/storage/sync-repositories";
import { emitHealthSnapshot } from "@sync/telemetry/health-snapshot.service";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";

const logger = Logger("sync:app");

// Transient Atlas/network blips stay visible at warn so they do not open a
// PostHog exception alert (PostHogExceptionTransport is error-level only).
// Durable failures still page. Same split as the health-snapshot onError.
function logSyncLoopError(message: string, error: unknown): void {
  if (isTransientMongoNetworkError(error)) {
    logger.warn(message, error);
    return;
  }
  logger.error(message, error);
}

export interface SyncService {
  readonly identity: ReturnType<typeof buildServiceIdentity>;
  readonly readiness: ReadinessRegistry;
  readonly shutdown: ShutdownCoordinator;
  readonly httpServer: Server;
  // Graceful stop: close the HTTP front door first (stop admitting new work),
  // then drain background dependencies in reverse order (workers -> storage).
  // Idempotent — safe to call from repeated signals or test cleanup.
  readonly stop: () => Promise<void>;
}

// Wires the service's lifecycle pieces from a validated config without binding
// a port or reading a file — so tests can drive it directly. Later commits
// register storage/scheduler readiness checks and drain tasks against the
// returned registries.
export function createSyncService(
  config: SyncConfig,
  deps: {
    mongo?: SyncMongoService;
    // Override the provider adapter (tests inject a fake to avoid the network);
    // production builds it from config.
    authAdapter?: ProviderAuthAdapter;
    // Override the provider event writer (tests inject a fake); production
    // builds it from config.
    writer?: ProviderEventWriter;
    // Override the provider contacts port (tests inject a fake); production
    // builds it from config.
    contacts?: ContactsPort;
    // Full registry replacement (tests inject a fake set of kinds).
    registry?: ProviderRegistry;
    adapterOverrides?: ProviderAdapterOverrides;
  } = {},
): SyncService {
  const identity = buildServiceIdentity({
    environment: config.NODE_ENV,
    execution: config.EXECUTION,
    version: normalizeDeployVersion(config.VERSION),
  });
  const readiness = new ReadinessRegistry();
  const shutdown = new ShutdownCoordinator();

  // Unset POST_CONNECT_REDIRECT_URL silently falls back to this service's own
  // CALLBACK_BASE_URL (an API host, not the web app) - every OAuth connect
  // and reconnect would drop the browser there instead of back on the
  // calendar. Only worth warning about in active mode: passive never
  // completes an OAuth round-trip.
  if (config.EXECUTION === "active" && !config.POST_CONNECT_REDIRECT_URL) {
    logger.warn(
      "sync.postConnectRedirectUrl is not set - Google connect/reconnect will redirect users to this service's own URL instead of the web app. Set it to the web app's origin.",
    );
  }

  const adapterOverrides: ProviderAdapterOverrides =
    deps.adapterOverrides ??
    (deps.authAdapter || deps.writer || deps.contacts
      ? {
          google: {
            auth: deps.authAdapter,
            writer: deps.writer,
            contacts: deps.contacts,
          },
        }
      : {});
  const registry =
    deps.registry ?? buildProviderRegistry(config, adapterOverrides);

  // The internal connection API mounts only when storage is provided. Its
  // routes read the connected db per request, so the app is still built before
  // Mongo connects (liveness-first startup).
  const connectionApi = deps.mongo
    ? {
        authMiddleware: createInternalAuthMiddleware({
          secret: config.INTERNAL_AUTH_TOKEN,
        }),
        serviceAuthMiddleware: createInternalServiceAuthMiddleware({
          secret: config.INTERNAL_AUTH_TOKEN,
        }),
        mongo: deps.mongo,
        execution: config.EXECUTION,
        registry,
        // The OAuth CSRF state is signed with a key derived from the service
        // secret (domain-separated from internal-auth signing); the callback
        // resolves against the public base URL.
        stateSecret: deriveOAuthStateSecret(config.INTERNAL_AUTH_TOKEN),
        credentialEncryptionSecret: config.INTERNAL_AUTH_TOKEN,
        credentialAtRestKey: config.CREDENTIAL_ENCRYPTION_KEY,
        callbackBaseUrl: config.CALLBACK_BASE_URL,
        // Fall back to the callback base when no explicit redirect is set.
        postConnectRedirectUrl:
          config.POST_CONNECT_REDIRECT_URL ?? config.CALLBACK_BASE_URL,
      }
    : undefined;

  const app = buildSyncApp({ identity, readiness, connectionApi });
  const httpServer = configureHttpServer(createServer(app));

  const stop = async (): Promise<void> => {
    // Phase 1: stop accepting new connections before anything drains, so no
    // new request can hit a dependency that is about to close.
    await closeHttpServer(httpServer);
    // Phase 2: reverse-order teardown of background dependencies. The
    // coordinator is idempotent, so a second stop() (repeated signal, test
    // cleanup) does not re-run drains.
    const errors = await shutdown.shutdown();
    for (const { name, error } of errors) {
      logger.error(`Shutdown task "${name}" failed`, error);
    }
  };

  return { identity, readiness, shutdown, httpServer, stop };
}

function closeHttpServer(httpServer: Server): Promise<void> {
  if (!httpServer.listening) return Promise.resolve();
  return new Promise((resolve, reject) =>
    httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}

async function start(): Promise<void> {
  const config = loadSyncConfig();

  startOtelLogs({
    serviceName: "compass-sync",
    nodeEnv: config.NODE_ENV,
    posthogKey: config.POSTHOG_KEY,
    posthogHost: config.POSTHOG_HOST,
    version: normalizeDeployVersion(config.VERSION),
  });

  // Build the mongo service before the app so the internal connection API can
  // read from it. It is not connected yet; the app binds its port first and the
  // routes access the db lazily, per request.
  const mongo = new SyncMongoService();
  const service = createSyncService(config, { mongo });

  // Register the disconnect drain first so, under the coordinator's
  // reverse-order teardown, storage closes LAST — after any workers that
  // depend on it. Readiness reflects storage state, so /health/ready stays 503
  // until Mongo is connected and its indexes are installed.
  service.shutdown.register("mongo", () => mongo.disconnect());
  service.shutdown.register("otel-logs", () => stopOtelLogs());
  service.readiness.register("storage", async () => {
    if (!mongo.isConnected) return false;
    await mongo.db.command({ ping: 1 });
    return true;
  });

  registerSignalHandlers(service, logger);

  // Bind the port before connecting storage so liveness comes up regardless.
  // A passive service must stay alive and report not-ready if Mongo is
  // unreachable, rather than crash-loop under the restart policy.
  await new Promise<void>((resolve) =>
    service.httpServer.listen(config.PORT, () => {
      logger.info(
        `${service.identity.name} listening on ${config.PORT} (${service.identity.environment}, execution=${service.identity.execution})`,
      );
      resolve();
    }),
  );

  // Connect storage after the port is open. A failure — unreachable store, or
  // a least-privilege violation — is logged and leaves readiness at 503; it
  // does not take the process down. The passive service does no work until
  // ready, so staying up-but-not-ready is safe and diagnosable.
  try {
    await mongo.connect({
      uri: config.MONGO_URI,
      forbiddenDatabaseName: config.COMPASS_API_DATABASE,
      enforceLeastPrivilege: config.ENFORCE_LEAST_PRIVILEGE,
    });

    // Retention is local-only (no provider calls), so it runs in passive mode
    // too — soft-disconnected caches must still age out. Register before the
    // mongo drain so reverse-order teardown stops the sweep first.
    const retention = buildRetentionSweep(mongo);
    service.shutdown.register("retention", () => retention.stop());
    retention.start();

    // Sanitized sync_health_snapshot every five minutes (S44). Runs in passive
    // mode too so the heartbeat stays alive before provider work is enabled.
    const posthog = buildPostHogClient(config);
    if (posthog) {
      service.shutdown.register("posthog", () => posthog.shutdown());
    }
    const registry = buildProviderRegistry(config);
    const health = buildHealthSnapshotSweep(
      service.identity,
      mongo,
      posthog,
      registry,
    );
    service.shutdown.register("health", () => health.stop());
    health.start();

    // Active, provider-configured deployments also drain jobs and renew
    // channels. Those register AFTER the mongo drain so teardown stops them
    // first and closes mongo last.
    const schedulers = buildSchedulers(
      config,
      mongo,
      service.identity,
      posthog,
    );
    if (schedulers) {
      service.shutdown.register("scheduler", async () => {
        // Stop every drain; each releases only its own owner's held jobs.
        await Promise.all(schedulers.drains.map((drain) => drain.stop()));
      });
      for (const [name, sweep] of schedulers.sweeps) {
        service.shutdown.register(name, () => sweep.stop());
      }
      for (const drain of schedulers.drains) drain.start();
      for (const [, sweep] of schedulers.sweeps) sweep.start();
      logger.info(
        "Sync scheduler draining, reconciling, renewing channels, retaining, retrying stale commands, and reporting health",
      );
    } else {
      logger.info(
        "Sync retention + health snapshot started (passive / unconfigured)",
      );
    }
  } catch (error) {
    logger.error(
      "Sync storage unavailable at startup; staying up as not-ready",
      error,
    );
  }
}

// A failed job is eligible for the self-heal sweep once it has sat failed for
// at least this long — long enough that a real provider outage has had a
// chance to clear before we burn another retry ladder on it.
const FAILED_JOB_REQUEUE_COOLDOWN_MS = 30 * 60_000;
// The bootstrap-recovery sweep below and connection-state's own bootstrapOverdue
// evidence share BOOTSTRAP_STALLED_AFTER_MS (imported from connection-state.ts)
// so the UI and the self-heal sweep agree on which resources are stuck.
// A cloud command left nonterminal past this long since its last update is
// eligible for a retry - long enough that a transient provider blip has
// almost certainly cleared, short enough that "deleting" doesn't sit visibly
// stuck for too long.
const STALE_COMMAND_RETRY_AFTER_MS = 5 * 60_000;
// A push channel expiring within this window is swept for renewal. Matches
// maintainSubscription's default renew guard so the sweep and the operation
// agree on what "near expiry" means.
const SUBSCRIPTION_RENEW_BEFORE_MS = 24 * 60 * 60_000;
// How often to look for soft-disconnected connections past the 30-day cache
// window. Daily is enough for the retention SLA; hourly keeps catch-up snappy.
const RETENTION_SWEEP_INTERVAL_MS = 60 * 60_000;
// A connection whose calendar list has not been fully re-discovered within
// this window is swept: a calendar deleted or unshared at the provider is
// otherwise never retired, because calendarListSync only ever runs once, at
// connect. Runs on the sweep's default ~10min interval (like reconcile and
// bootstrapRecovery below, neither of which overrides it either) — cheap to
// poll for, and the limit-bounded finder means the eligible population still
// self-spreads across cycles rather than sweeping the whole fleet at once.
const CALENDAR_LIST_STALE_AFTER_MS = 24 * 60 * 60_000;
// Architecture: one sync_health_snapshot every five minutes.
const HEALTH_SNAPSHOT_INTERVAL_MS = 5 * 60_000;
// Cap on how long each background sweep waits before its first tick after
// process start. Spreads the boot burst across the fleet of sweeps so they do
// not all enqueue at t=0; it does not shrink total work. User-priority claim
// arms are what protect Refresh clicks during the drain.
const STARTUP_SWEEP_JITTER_MS = 60_000;

function buildPostHogClient(config: SyncConfig): PostHogCaptureClient | null {
  if (!config.POSTHOG_KEY) return null;
  return createPostHogCaptureClient({
    apiKey: config.POSTHOG_KEY,
    host: config.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    lib: "compass-sync",
  });
}

// Consecutive health snapshots (5 min apart) that must all report a fully
// unnotified fleet before the push-delivery alarm fires. Deliberately in
// memory: a restart re-arming the hour is fine for a condition that persisted
// for nine days, and it keeps a diagnostic counter out of the storage schema.
const PUSH_SILENCE_ALERT_AFTER_SAMPLES = 12;
const pushSilenceStreaks = new Map<string, number>();

function buildHealthSnapshotSweep(
  identity: ReturnType<typeof buildServiceIdentity>,
  mongo: SyncMongoService,
  client: PostHogCaptureClient | null,
  registry: ProviderRegistry,
): SweepScheduler {
  return new SweepScheduler(
    {
      // SweepScheduler always passes `before`; health ignore it and use now.
      sweep: async () => {
        // A single Atlas/DNS blip must not skip the whole 5-minute gauge.
        const snapshots = await withTransientMongoRetry(() =>
          emitHealthSnapshot({
            deps: { mongo, identity, registry },
            client,
          }),
        );
        // Every live channel unnotified means push delivery is broken fleet
        // wide, not that calendars are quiet. It looks like nothing is wrong:
        // the reconcile sweep keeps calendars up to date on its ~10 minute
        // cadence, so the only symptom is slowness. Prod ran this way for nine
        // days in August 2026 with the number sitting at 425 of 425, because
        // the reverse proxy had stopped routing /sync/* here. A PostHog gauge
        // alone did not surface it, so say it in the log too.
        //
        // Only after the condition HOLDS, though. A single snapshot cannot
        // tell a broken route from a quiet hour, and it is briefly true in two
        // healthy situations: right after a route is repaired (nothing has
        // changed at the provider yet), and on a fleet whose calendars simply
        // sit idle. Firing on the first sample would have cried wolf on the
        // very deploy that FIXED this. Requiring an hour of consecutive
        // samples costs nothing against a nine-day outage.
        //
        // "Never notified" also counts the provider's own proof of reaching
        // the endpoint: Google's initial `sync` callback, and for a provider
        // that validates the callback URL before opening a channel, the
        // watch itself (NotificationChannel.callbackVerified). Without the
        // latter, staging fired this for Microsoft after every restart on
        // four idle subscriptions whose creation had already proven the
        // route.
        for (const snapshot of snapshots) {
          if (
            !registry
              .get(snapshot.provider)
              .capabilities.includes("changeNotifications")
          ) {
            continue;
          }
          const { neverNotified, healthy, renewSoon } = snapshot.subscriptions;
          const live = healthy + renewSoon;
          const streakKey = snapshot.provider;
          if (live > 0 && neverNotified >= live) {
            const streak = (pushSilenceStreaks.get(streakKey) ?? 0) + 1;
            pushSilenceStreaks.set(streakKey, streak);
            if (streak === PUSH_SILENCE_ALERT_AFTER_SAMPLES) {
              logger.error(
                `Sync push delivery looks broken for ${snapshot.provider}: all ${live} live subscription(s) have gone without a single notification for over an hour. Check that the reverse proxy routes /sync/* to this service.`,
              );
            }
          } else {
            pushSilenceStreaks.set(streakKey, 0);
          }
        }
        return snapshots.length;
      },
    },
    {
      intervalMs: HEALTH_SNAPSHOT_INTERVAL_MS,
      jitterRatio: 0.05,
      onError: (error) => {
        // Transient Mongo network failures are expected blips; warn so they
        // stay visible without opening a PostHog exception alert.
        if (isTransientMongoNetworkError(error)) {
          logger.warn("Sync health snapshot emit failed", error);
          return;
        }
        logger.error("Sync health snapshot emit failed", error);
      },
    },
  );
}

// Local-only: purge soft-disconnected connection caches past the retention
// window. Safe without provider credentials and in passive execution.
function buildRetentionSweep(mongo: SyncMongoService): SweepScheduler {
  const deps = syncRepositories(mongo);
  return new SweepScheduler(
    {
      sweep: (before) => purgeExpiredDisconnectedConnections(deps, before),
    },
    {
      intervalMs: RETENTION_SWEEP_INTERVAL_MS,
      windowMs: -CONNECTION_CACHE_RETENTION_MS,
      onError: (error) =>
        logSyncLoopError("Sync disconnect retention sweep failed", error),
    },
  );
}

// Build the background schedulers for an active, provider-configured deployment:
// the queue DRAINS (claim and run jobs), the RECONCILE sweep (the missed-webhook
// fallback that enqueues pulls for stale calendars), and the SUBSCRIPTION sweep
// (that renews push channels before they expire). Returns null when there is
// nothing to run (passive execution, or no provider credentials to refresh access
// tokens with). Repositories bind to the now-connected db.
//
// MAX_CONCURRENCY drains run in parallel. A worker's drain loop is sequential —
// it awaits each job before claiming the next — so a single drain processes the
// whole queue one job at a time, and one long initialImport stalls every queued
// pull behind it. That starved change-propagation for hours after the
// 2026-07-29 production cutover.
//
// Each drain gets its OWN owner id, which is load-bearing: leases are per-owner
// and `releaseOwned(owner)` releases exactly that worker's held jobs on stop, so
// sharing an id would let one worker's shutdown flip another's in-flight job
// back to pending mid-run. Racing claims are already safe — claimDueJob is a
// single atomic findOneAndUpdate, so two workers can never win the same job.
function buildSchedulers(
  config: SyncConfig,
  mongo: SyncMongoService,
  identity: ReturnType<typeof buildServiceIdentity>,
  posthog: PostHogCaptureClient | null,
): {
  drains: SyncScheduler[];
  sweeps: ReadonlyArray<readonly [name: string, sweep: SweepScheduler]>;
} | null {
  if (config.EXECUTION !== "active") return null;
  const registry = buildProviderRegistry(config);
  if (registry.kinds().length === 0) return null;

  const resolveAdapters = resolveAdaptersFrom(registry);
  const resolveAuth = resolveAuthFrom(registry);

  const repos = syncRepositories(mongo);
  const resources = repos.syncResources;
  const jobs = repos.jobs;
  // Long-running kinds excluded from a reserved lane. initialImport and
  // repair are the two that can run for minutes on a large calendar; every
  // other kind is quick, so a reserved lane still drains the whole rest of
  // the queue, just never adopts one of these two.
  const RESERVED_LANE_EXCLUDED_KINDS: JobRecord["kind"][] = [
    "initialImport",
    "repair",
  ];

  const buildDrain = (reservedForPulls: boolean): SyncScheduler => {
    const owner = randomUUID();
    const worker = new SyncJobWorker(
      {
        events: repos.events,
        occurrences: repos.eventOccurrences,
        resources,
        calendars: repos.calendars,
        connections: repos.connections,
        credentials: repos.credentials,
        resolveAdapters,
        commands: repos.commands,
        jobs,
        custody: new CredentialCustody(
          repos.credentials,
          resolveAuth,
          undefined,
          undefined,
          config.CREDENTIAL_ENCRYPTION_KEY,
        ),
        // Where the provider posts change notifications back; the callback route
        // verifies them against the stored subscription.
        callbackUrlFor: (kind) =>
          registry.callbackUrlFor(config.CALLBACK_BASE_URL, kind),
        providerCapabilities: (kind) => registry.get(kind).capabilities,
        invalidations: repos.invalidations,
        log: logger,
      },
      owner,
      {
        onError: (error, job) =>
          logger.error(
            // resourceId is null for connection-wide kinds (calendarListSync);
            // say so rather than logging the literal string "null".
            `Sync job engine failed for resource ${
              job.resourceId ?? "none (connection-wide)"
            } on connection ${job.connectionId}`,
            error,
          ),
        onDrop: (job, reason) =>
          logger.warn(`Sync job ${job.kind} (${job._id}) dropped: ${reason}`),
        // A terminal failure is invisible otherwise: the job sits state:"failed"
        // holding its coalescing key with nothing paging anyone. Alertable so an
        // operator can set a PostHog alert on this event over launch weekend.
        onFail: (job, error) => {
          logger.error(
            `Sync job ${job.kind} (${job._id}) exhausted retries and failed for resource ${
              job.resourceId ?? "none (connection-wide)"
            } on connection ${job.connectionId}`,
            error,
          );
          void captureSafely(posthog, {
            event: SYNC_JOB_TERMINAL_FAILURE_EVENT,
            // One service-level distinct id — never a user id (R-SEC-04).
            distinctId: "compass-sync",
            properties: SyncJobTerminalFailureEventSchema.parse({
              environment: identity.environment,
              service: "compass-sync",
              jobKind: job.kind,
              connectionId: job.connectionId,
              resourceId: job.resourceId,
              attempt: job.attempt,
            }),
          });
        },
        excludeKinds: reservedForPulls
          ? RESERVED_LANE_EXCLUDED_KINDS
          : undefined,
      },
    );
    return new SyncScheduler(
      {
        worker: {
          drain: (max) => withTransientMongoRetry(() => worker.drain(max)),
        },
        jobs,
      },
      {
        owner,
        onError: (error) => logSyncLoopError("Sync job drain failed", error),
      },
    );
  };
  // Of the MAX_CONCURRENCY drains, the first RESERVED_PULL_LANES never claim
  // initialImport/repair — reserved so webhook/reconcile pulls always have a
  // lane free even when every other drain is busy on a long import (S40-
  // style starvation, 2026-07-29). The rest claim everything, unchanged.
  const drains = Array.from({ length: config.MAX_CONCURRENCY }, (_, index) =>
    buildDrain(index < config.RESERVED_PULL_LANES),
  );

  // Shared per-resource enqueue-failure logging for the resource sweeps below.
  const onEnqueueError =
    (sweep: string) => (error: unknown, resourceId: string) =>
      logger.error(
        `Sync ${sweep} sweep could not enqueue resource ${resourceId}; skipping it and continuing`,
        error,
      );

  const reconcileSweepRows = buildReconcileSweepRows(registry, config).map(
    (row) => ({
      name: row.name,
      windowMs: row.windowMs,
      intervalMs: row.intervalMs,
      run: async (before: Date) => {
        const enqueued = await enqueueForResources(
          { jobs, onEnqueueError: onEnqueueError(row.name) },
          listStaleEventsForRow(resources, row),
          (r, n) => resourceJob(r, "incrementalPull", n()),
          before,
          () => new Date(),
          row.limit,
        );
        if (enqueued > 0) {
          logger.info(`Sync ${row.name} sweep enqueued ${enqueued} pull(s)`);
        }
        if (row.name === "reconcile") {
          await captureSafely(posthog, {
            event: SYNC_RECONCILE_SWEEP_EVENT,
            distinctId: "compass-sync",
            properties: SyncReconcileSweepEventSchema.parse({
              environment: identity.environment,
              service: "compass-sync",
              enqueued,
            }),
          });
        }
        return enqueued;
      },
    }),
  );

  // One row per background sweep: `run` is the sweep's whole distinctive body
  // (finder, job kind, and its own logging/telemetry — they genuinely differ,
  // which is why #2588 stopped short of a fully shared implementation).
  // Everything repeated — scheduler construction, failure logging, shutdown
  // and start wiring — lives in the loop after the rows.
  const sweepRows: ReadonlyArray<{
    name: string;
    windowMs: number;
    intervalMs?: number;
    run: (before: Date) => Promise<number>;
  }> = [
    ...reconcileSweepRows,
    {
      // Subscription maintenance looks AHEAD: enqueue a renewal for any push
      // channel expiring within the renew window (positive offset from now),
      // so a channel is replaced before it lapses. Aligns with
      // maintainSubscription's renew guard.
      name: "subscription",
      windowMs: SUBSCRIPTION_RENEW_BEFORE_MS,
      run: (before) =>
        enqueueForResources(
          { jobs, onEnqueueError: onEnqueueError("subscription") },
          (b, l) => resources.listExpiringSubscriptions(b, l),
          (r, n) => resourceJob(r, "subscriptionMaintain", n()),
          before,
          () => new Date(),
        ),
    },
    {
      // Bootstrap-recovery looks BACK, like reconcile: enqueue a
      // bootstrapCatchup for any events resource whose bootstrap chain has
      // gone quiet before ready.
      name: "bootstrapRecovery",
      windowMs: -BOOTSTRAP_STALLED_AFTER_MS,
      run: async (before) => {
        const enqueued = await enqueueForResources(
          { jobs, onEnqueueError: onEnqueueError("bootstrap-recovery") },
          (b, l) => resources.listStalledBootstraps(b, l),
          (r, n) => resourceJob(r, "bootstrapCatchup", n()),
          before,
          () => new Date(),
        );
        if (enqueued > 0) {
          logger.warn(
            `Sync bootstrap-recovery sweep re-entered ${enqueued} stalled bootstrap(s)`,
          );
        }
        return enqueued;
      },
    },
    {
      // Self-heal sweep: give jobs stuck in state:"failed" a fresh retry
      // ladder once they have cooled down, and loudly log any that keep
      // re-failing past the requeue cap. Looks BACK, like reconcile — a job
      // is eligible once it has been failed since before the cooldown window.
      name: "failedJobRequeue",
      windowMs: -FAILED_JOB_REQUEUE_COOLDOWN_MS,
      run: async (before) => {
        const result = await requeueFailedJobs(
          { jobs, resources },
          before,
          () => new Date(),
          FAILED_JOB_MAX_REQUEUES,
        );
        if (result.requeued > 0) {
          logger.info(
            `Sync self-heal sweep requeued ${result.requeued} failed job(s)`,
          );
        }
        // Exhausted jobs whose connection already carries a durable provider
        // refusal are cleared automatically — retrying cannot help, and the
        // failed coalescing key would otherwise block rediscovery forever
        // (2026-08-09: notACalendarUser calendarListSync self-heal storm).
        if (result.clearedDurable > 0) {
          logger.warn(
            `Sync self-heal sweep cleared ${result.clearedDurable} exhausted job(s) blocked by durable provider read failure`,
            {
              clearedJobs: result.clearedJobs.map((job) => ({
                id: job.id,
                coalescingKey: job.coalescingKey,
                connectionId: job.connectionId,
                tenantId: job.tenantId,
                principalId: job.principalId,
                failureClass: job.failureClass,
                requeuedCount: job.requeuedCount,
                updatedAt: job.updatedAt.toISOString(),
              })),
            },
          );
        }
        if (result.exhausted > 0) {
          logger.error(
            `Sync self-heal sweep: ${result.exhausted} failed job(s) exhausted their requeue budget and need operator attention`,
            {
              exhaustedJobs: result.exhaustedJobs.map((job) => ({
                id: job.id,
                coalescingKey: job.coalescingKey,
                connectionId: job.connectionId,
                tenantId: job.tenantId,
                principalId: job.principalId,
                failureClass: job.failureClass,
                requeuedCount: job.requeuedCount,
                updatedAt: job.updatedAt.toISOString(),
              })),
            },
          );
        }
        return result.requeued + result.clearedDurable;
      },
    },
    {
      // Self-heal sweep for stuck inline cloud commands (create/update/delete)
      // that hit a transient provider failure mid-execute. Those run inline from
      // the HTTP request (not as a job); this sweep revisits them after the
      // stale window — see stale-command-retry.service.ts. Looks BACK, like
      // reconcile/failedJobRequeue.
      name: "staleCommandRetry",
      windowMs: -STALE_COMMAND_RETRY_AFTER_MS,
      run: async (before) => {
        const result = await retryStaleCommands(
          {
            commands: repos.commands,
            events: repos.events,
            calendars: repos.calendars,
            occurrences: repos.eventOccurrences,
            resources: repos.syncResources,
            connections: repos.connections,
            markers: repos.deletionMarkers,
            execution: config.EXECUTION,
            provider: {
              resolveAdapters,
              custody: new CredentialCustody(
                repos.credentials,
                resolveAuth,
                undefined,
                undefined,
                config.CREDENTIAL_ENCRYPTION_KEY,
              ),
            },
            onRetryError: (error, commandId) =>
              logger.error(
                `Sync stale-command sweep could not retry command ${commandId}; skipping it and continuing`,
                error,
              ),
          },
          before,
          () => new Date(),
        );
        if (result.attempted > 0) {
          logger.info(
            `Sync stale-command sweep retried ${result.attempted} command(s), ${result.stillStale} still stuck`,
          );
        }
        return result.attempted;
      },
    },
    {
      // Calendar-list rediscovery looks BACK, like reconcile: force a FULL
      // discovery pass for any connection whose calendar list has not been
      // re-listed within the staleness window, so a calendar the provider no
      // longer lists eventually gets retired (deactivateAbsent only fires on
      // a full pass, and only this sweep forces one after the initial
      // connect).
      name: "calendarListRediscovery",
      windowMs: -CALENDAR_LIST_STALE_AFTER_MS,
      run: async (before) => {
        const enqueued = await rediscoverStaleCalendarLists(
          {
            resources,
            jobs,
            onError: onEnqueueError("calendar-list rediscovery"),
          },
          before,
          () => new Date(),
        );
        if (enqueued > 0) {
          logger.info(
            `Sync calendar-list rediscovery sweep enqueued ${enqueued} full re-discovery(ies)`,
          );
        }
        return enqueued;
      },
    },
  ];

  const sweeps = sweepRows.map(
    ({ name, windowMs, intervalMs, run }) =>
      [
        name,
        new SweepScheduler(
          { sweep: run },
          {
            windowMs,
            ...(intervalMs !== undefined ? { intervalMs } : {}),
            startupJitterMs: STARTUP_SWEEP_JITTER_MS,
            onError: (error) =>
              logSyncLoopError(`Sync ${name} sweep failed`, error),
          },
        ),
      ] as const,
  );
  return { drains, sweeps };
}

function registerSignalHandlers(
  service: SyncService,
  log: ReturnType<typeof Logger>,
): void {
  const handle = (signal: NodeJS.Signals) => {
    if (service.shutdown.isShuttingDown) return;
    log.info(`Received ${signal}, draining Sync service`);
    void service.stop();
  };

  process.on("SIGTERM", () => handle("SIGTERM"));
  process.on("SIGINT", () => handle("SIGINT"));
  process.on("SIGQUIT", () => handle("SIGQUIT"));
}

if (import.meta.main) {
  // Registering a handler suppresses Node/Bun's default crash-on-unhandled-
  // rejection behavior, so without one of our own the process would keep
  // running silently after whatever left a promise dangling - no log, no
  // restart, just a process in an unknown state. Log with context, then exit
  // the same way an uncaught synchronous throw would. Gated behind
  // import.meta.main like the rest of this block so a test importing this
  // module for its exports never installs a process-wide handler. `reason`
  // can be anything, including a raw GaxiosError from an uncaught Google API
  // call (this process talks to Google constantly) - redactedCause strips
  // its config/response before logging.
  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled promise rejection", redactedCause(reason));
    process.exit(1);
  });

  start().catch((error) => {
    logger.error("Sync service failed to start", error);
    process.exit(1);
  });
}
