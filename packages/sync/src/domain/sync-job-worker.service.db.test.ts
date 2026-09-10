import { faker } from "@faker-js/faker";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import {
  ensureEventsResource,
  FakeReader,
  fakeResolveAdapters,
  pageOf,
  seedProviderCalendar,
  singleEvent as single,
  fakeTokenSource as tokenSource,
} from "@sync/__tests__/helpers/fixtures";
import { stringIdFilter } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  SyncJobWorker,
  type SyncJobWorkerDeps,
} from "@sync/domain/sync-job-worker.service";
import {
  type ProviderCalendarAdapter,
  ProviderCalendarError,
} from "@sync/providers/provider-calendar.port";
import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type JobRecord } from "@sync/storage/contracts/job.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { InvalidationRepository } from "@sync/storage/repositories/invalidation.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-07-10T00:00:00.000Z");
const OWNER = "worker-under-test";

const googleProviderCapabilities = [
  "readEvents",
  "writeEvents",
  "readBusy",
  "inviteAttendees",
  "changeNotifications",
  "incrementalChanges",
] as const;

describe("SyncJobWorker", () => {
  const storage = setupSyncStorage(import.meta.url);
  let events: EventRepository;
  let occurrences: EventOccurrenceRepository;
  let resources: SyncResourceRepository;
  let calendars: ProviderCalendarRepository;
  let commands: CommandRepository;
  let jobs: JobRepository;
  let connections: ProviderConnectionRepository;
  let invalidations: InvalidationRepository;

  beforeEach(() => {
    events = new EventRepository(storage.db());
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    resources = new SyncResourceRepository(storage.db());
    calendars = new ProviderCalendarRepository(storage.db());
    commands = new CommandRepository(storage.db());
    jobs = new JobRepository(storage.db());
    connections = new ProviderConnectionRepository(storage.db());
    invalidations = new InvalidationRepository(storage.db());
  });

  const defaultDiscovery: ProviderCalendarAdapter = {
    discoverCalendars: async () => ({ calendars: [], cursor: null }),
  };

  const seedCalendar = async (
    overrides: Parameters<typeof seedProviderCalendar>[1] = {},
  ): Promise<ProviderCalendarRecord> => {
    const tenantId =
      overrides.tenantId ?? (objectId() as ProviderCalendarRecord["tenantId"]);
    const principalId =
      overrides.principalId ??
      (objectId() as ProviderCalendarRecord["principalId"]);
    const connection = await connections.upsertByProviderAccount({
      tenantId,
      principalId,
      provider: "google",
      account: {
        email: "user@example.com",
        displayName: "User",
        providerAccountId: "google-subject",
      },
      capabilities: [
        "readEvents",
        "writeEvents",
        "readBusy",
        "inviteAttendees",
        "changeNotifications",
        "incrementalChanges",
      ],
      state: "healthy",
      stateReason: null,
    });
    return seedProviderCalendar(calendars, {
      tenantId,
      principalId,
      connectionId: connection._id,
      ...overrides,
    });
  };

  const deps = (
    reader: FakeReader,
    discoveryOverride: ProviderCalendarAdapter = defaultDiscovery,
  ): SyncJobWorkerDeps => ({
    events,
    occurrences,
    resources,
    calendars,
    connections,
    credentials: new CredentialRepository(storage.db()),
    resolveAdapters: fakeResolveAdapters(reader, {
      calendars: discoveryOverride,
    }),
    commands,
    jobs,
    custody: tokenSource,
    callbackUrlFor: () => "https://sync.example/sync/notifications/google",
    providerCapabilities: () => googleProviderCapabilities,
    invalidations,
  });

  const worker = (reader: FakeReader) =>
    new SyncJobWorker(deps(reader), OWNER, { now });

  // A worker that records every drop reason, so a test can assert the drop path
  // was taken (and why) rather than only that the job row vanished.
  const workerRecordingDrops = (
    reader: FakeReader,
    discoveryOverride: ProviderCalendarAdapter = defaultDiscovery,
  ) => {
    const drops: string[] = [];
    const w = new SyncJobWorker(deps(reader, discoveryOverride), OWNER, {
      now,
      onDrop: (_job, reason) => drops.push(reason),
    });
    return { worker: w, drops };
  };

  // A worker that records every engine-throw error (with its job), so a test
  // can assert on the wrapper message and that the original cause is attached.
  const workerRecordingErrors = (reader: FakeReader) => {
    const errors: { error: Error; job: JobRecord }[] = [];
    const w = new SyncJobWorker(deps(reader), OWNER, {
      now,
      onError: (error, job) => {
        if (error instanceof Error) errors.push({ error, job });
      },
    });
    return { worker: w, errors };
  };

  const workerWith = (
    reader: FakeReader,
    options: { maxAttempts?: number; random?: () => number },
  ) => new SyncJobWorker(deps(reader), OWNER, { now, ...options });

  const seedResource = async (
    calendar: ProviderCalendarRecord,
    cursor: string | null,
  ): Promise<SyncResourceRecord> =>
    ensureEventsResource(resources, calendar, {
      cursor: cursor ?? undefined,
      now,
    });

  const enqueue = (
    resource: Pick<
      SyncResourceRecord,
      "tenantId" | "principalId" | "connectionId" | "_id"
    >,
    kind: JobRecord["kind"],
  ) =>
    jobs.enqueue({
      tenantId: resource.tenantId,
      principalId: resource.principalId,
      connectionId: resource.connectionId,
      resourceId: resource._id,
      commandId: null,
      kind,
      priority: 0,
      runAfter: now(),
      coalescingKey: `${kind}:${resource._id}`,
    });

  const jobByKey = (coalescingKey: string) =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).findOne({ coalescingKey });

  it("is idle when no job is due", async () => {
    const outcome = await worker(new FakeReader([])).runOnce();
    expect(outcome).toBe("idle");
  });

  it("passes excludeKinds through to claimDueJob, leaving an excluded due job untouched", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    const job = await enqueue(resource, "initialImport");
    const reservedWorker = new SyncJobWorker(deps(new FakeReader([])), OWNER, {
      now,
      excludeKinds: ["initialImport"],
    });

    const outcome = await reservedWorker.runOnce();

    expect(outcome).toBe("idle");
    const after = await jobs.findById(
      resource.tenantId,
      resource.principalId,
      job._id,
    );
    expect(after?.state).toBe("pending");
  });

  it("completes an applied incremental pull, removing the job", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");

    const result = await worker(
      new FakeReader([
        pageOf([single("new-1")], { nextSyncToken: "cursor-1" }),
      ]),
    ).runOnce();

    expect(result).toBe("processed");
    expect(
      await jobs.findById(resource.tenantId, resource.principalId, job._id),
    ).toBeNull();
  });

  it("re-derives connection health after a successful pull settles", async () => {
    const connection = await connections.upsertByProviderAccount({
      tenantId: objectId(),
      principalId: objectId(),
      provider: "google",
      account: {
        providerAccountId: "acct-1",
        email: "user@example.com",
        displayName: "User",
      },
      capabilities: ["readEvents", "readBusy", "writeEvents"],
      state: "delayed",
      stateReason: "providerErrors",
    });
    const credentials = new CredentialRepository(storage.db());
    await seedOauthCredential(credentials, {
      connectionId: connection._id,
      provider: "google",
      refreshToken: "refresh",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    const calendar = await seedCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
    });
    const listResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "calendarList",
      calendarId: null,
    });
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      listResource._id,
      "list-cursor",
      now(),
    );
    const eventsResource = await seedResource(calendar, "cursor-0");
    await resources.setBootstrapState(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "ready",
    );
    await enqueue(eventsResource, "incrementalPull");

    await worker(
      new FakeReader([
        pageOf([single("new-1")], { nextSyncToken: "cursor-1" }),
      ]),
    ).runOnce();

    const after = await connections.findById(
      connection.tenantId,
      connection.principalId,
      connection._id,
    );
    expect(after?.state).toBe("healthy");
    expect(after?.stateReason).toBeNull();
    expect(after?.lastHealthyAt).toBeInstanceOf(Date);
  });

  it("hands an expired-cursor pull off by enqueuing a repair and completing the pull", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "stale");
    const pull = await enqueue(resource, "incrementalPull");

    await worker(
      new FakeReader([], new ProviderEventReadError("cursorExpired", "gone")),
    ).runOnce();

    // The pull job is gone; a coalesced repair job now waits.
    expect(
      await jobs.findById(resource.tenantId, resource.principalId, pull._id),
    ).toBeNull();
    const repair = await jobByKey(`repair:${resource._id}`);
    expect(repair?.kind).toBe("repair");
    expect(repair?.state).toBe("pending");
  });

  it("reschedules a repair that did not complete instead of deleting it", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    const job = await enqueue(resource, "repair");

    // A page with no nextSyncToken makes the repair report incomplete.
    await worker(new FakeReader([pageOf([single("keep")])])).runOnce();

    const after = await jobs.findById(
      resource.tenantId,
      resource.principalId,
      job._id,
    );
    expect(after?.state).toBe("pending");
    expect(after?.leaseOwner).toBeNull();
    // Backed off to a future runAfter, and its failure class recorded.
    expect(after!.runAfter.getTime()).toBeGreaterThan(now().getTime());
    expect(after?.failureClass).toBe("retryableTransient");
  });

  it("reschedules a job whose engine throws a transient error", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");

    // A non-cursorExpired read error propagates out of dispatch.
    await worker(
      new FakeReader([], new ProviderEventReadError("transient", "flaky")),
    ).runOnce();

    const after = await jobs.findById(
      resource.tenantId,
      resource.principalId,
      job._id,
    );
    expect(after?.state).toBe("pending");
    expect(after!.runAfter.getTime()).toBeGreaterThan(now().getTime());
  });

  it("reports the failing job and preserves the cause when the engine throws", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");
    const cause = new ProviderEventReadError("transient", "flaky");

    const { worker, errors } = workerRecordingErrors(new FakeReader([], cause));
    await worker.runOnce();

    expect(errors).toHaveLength(1);
    // The sanitized cause must be IN the message: the PostHog exception title
    // is built from the message alone, so a bare "attempt N failed" hides the
    // real error in event properties.
    expect(errors[0]?.error.message).toBe(
      `Sync job incrementalPull (${job._id}) attempt 1 failed: flaky`,
    );
    expect(errors[0]?.error.cause).toBe(cause);
    expect(errors[0]?.job.resourceId).toBe(job.resourceId);
    expect(errors[0]?.job.connectionId).toEqual(job.connectionId);
  });

  it("fails a transient job once its retries are exhausted", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");

    // maxAttempts: 1 means the first (attempt 1) transient failure is terminal.
    await workerWith(
      new FakeReader([], new ProviderEventReadError("transient", "flaky")),
      { maxAttempts: 1 },
    ).runOnce();

    const after = await jobs.findById(
      resource.tenantId,
      resource.principalId,
      job._id,
    );
    expect(after?.state).toBe("failed");
    expect(after?.failureClass).toBe("retryableTransient");
    expect(after?.leaseOwner).toBeNull();
    expect(after?.lastError).toContain("flaky");
    expect(after?.lastErrorAt).toEqual(now());
  });

  it("does not call onFail while a transient failure still has retries left", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await enqueue(resource, "incrementalPull");
    const failed: JobRecord[] = [];
    const worker = new SyncJobWorker(
      deps(
        new FakeReader([], new ProviderEventReadError("transient", "flaky")),
      ),
      OWNER,
      { now, maxAttempts: 5, onFail: (j) => failed.push(j) },
    );

    await worker.runOnce();

    expect(failed).toHaveLength(0);
  });

  it("calls onFail exactly once, with the job, on the exhausting attempt", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");
    const failed: JobRecord[] = [];
    // maxAttempts: 1 means the first (attempt 1) transient failure is terminal.
    const worker = new SyncJobWorker(
      deps(
        new FakeReader([], new ProviderEventReadError("transient", "flaky")),
      ),
      OWNER,
      { now, maxAttempts: 1, onFail: (j) => failed.push(j) },
    );

    await worker.runOnce();

    expect(failed).toHaveLength(1);
    expect(failed[0]?._id).toEqual(job._id);
  });

  it("records lastError on a retrying job so connection health can see it", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");

    await workerWith(
      new FakeReader([], new ProviderEventReadError("transient", "flaky")),
      { maxAttempts: 5 },
    ).runOnce();

    const after = await jobs.findById(
      resource.tenantId,
      resource.principalId,
      job._id,
    );
    expect(after?.state).toBe("pending");
    expect(after?.failureClass).toBe("retryableTransient");
    expect(after?.lastError).toContain("flaky");
    expect(after?.lastErrorAt).toEqual(now());
  });

  it("keeps a failed job's coalescing key so enqueue does not replace it", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await enqueue(resource, "incrementalPull");

    await workerWith(
      new FakeReader([], new ProviderEventReadError("transient", "flaky")),
      { maxAttempts: 1 },
    ).runOnce();

    // A fresh trigger for the same resource coalesces onto the failed job rather
    // than creating a new pending one — the failure needs attention first.
    const reenqueued = await enqueue(resource, "incrementalPull");
    expect(reenqueued.state).toBe("failed");
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({ coalescingKey: `incrementalPull:${resource._id}` }),
    ).toBe(1);
  });

  it("applies bounded jitter to the retry backoff", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    const job = await enqueue(resource, "repair");

    // random 0 => the low end of the +/-20% jitter on the 10s base (attempt 1).
    await workerWith(new FakeReader([pageOf([single("keep")])]), {
      random: () => 0,
    }).runOnce();

    const after = await jobs.findById(
      resource.tenantId,
      resource.principalId,
      job._id,
    );
    // base 10_000ms * (1 - 0.2) = 8_000ms after now.
    expect(after?.runAfter).toEqual(new Date(now().getTime() + 8_000));
  });

  it("schedules a heartbeat per job and stops it once the job settles", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await enqueue(resource, "incrementalPull");

    let everyMs = 0;
    let stopped = false;
    const w = new SyncJobWorker(
      deps(
        new FakeReader([pageOf([single("a")], { nextSyncToken: "cursor-1" })]),
      ),
      OWNER,
      {
        now,
        leaseMs: 30_000,
        heartbeatMs: 10_000,
        scheduleHeartbeat: (_beat, ms) => {
          everyMs = ms;
          return () => {
            stopped = true;
          };
        },
      },
    );

    await w.runOnce();

    expect(everyMs).toBe(10_000);
    expect(stopped).toBe(true); // cleaned up in the finally, even on success
  });

  it("extends the lease of a running job through the heartbeat", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await enqueue(resource, "incrementalPull");

    // A mutable clock so a heartbeat's new expiry differs from the claim's.
    let clock = now().getTime();
    const movingNow = () => new Date(clock);

    // A reader that blocks the pull mid-flight until released, so the job stays
    // claimed while we fire a heartbeat.
    let releaseRead: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const gatedReader = {
      async listEventPage() {
        await gate;
        return pageOf([single("x")], { nextSyncToken: "cursor-1" });
      },
    } as unknown as FakeReader;

    let onHeartbeat: (() => void | Promise<void>) | undefined;
    const w = new SyncJobWorker(deps(gatedReader), OWNER, {
      now: movingNow,
      leaseMs: 300_000,
      scheduleHeartbeat: (beat) => {
        onHeartbeat = beat;
        return () => {};
      },
    });

    const run = w.runOnce();
    // Wait until the worker has claimed the job and scheduled its heartbeat
    // (claimDueJob is a real round-trip, so a bare setTimeout(0) can beat it).
    while (!onHeartbeat) await new Promise((r) => setTimeout(r, 5));

    const claimed = await jobByKey(`incrementalPull:${resource._id}`);
    const claimedLease = (claimed?.leaseExpiresAt as Date).getTime();

    // Advance time and fire one heartbeat; the lease must move forward.
    clock += 60_000;
    await onHeartbeat?.();

    const beaten = await jobByKey(`incrementalPull:${resource._id}`);
    expect((beaten?.leaseExpiresAt as Date).getTime()).toBe(clock + 300_000);
    expect((beaten?.leaseExpiresAt as Date).getTime()).toBeGreaterThan(
      claimedLease,
    );

    releaseRead();
    await run;
  });

  it("drops a job whose resource no longer exists", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    // Enqueue against the resource, then remove the resource so dispatch drops.
    const job = await enqueue(resource, "incrementalPull");
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.syncResources)
      .deleteOne(stringIdFilter(resource._id));

    await worker(new FakeReader([])).runOnce();

    expect(
      await jobs.findById(resource.tenantId, resource.principalId, job._id),
    ).toBeNull();
  });

  it("settles a job whose calendar went inactive instead of retrying it", async () => {
    const calendar = await seedCalendar({ active: false });
    const resource = await seedResource(calendar, null);
    const job = await enqueue(resource, "initialImport");

    // A reader with no scripted pages: reaching it at all would throw, so the
    // job must be settled before any provider call is made.
    const { worker: w, drops } = workerRecordingDrops(new FakeReader([]));
    await w.runOnce();

    expect(
      await jobs.findById(resource.tenantId, resource.principalId, job._id),
    ).toBeNull();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain("inactive");
  });

  it("frees the coalescing key when an inactive calendar's job is settled", async () => {
    const calendar = await seedCalendar({ active: false });
    const resource = await seedResource(calendar, null);
    await enqueue(resource, "initialImport");

    await worker(new FakeReader([])).runOnce();

    // Reactivating the calendar and re-triggering must produce a fresh pending
    // job — the settled one left no row to swallow the re-enqueue.
    await calendars.upsertByProviderCalendar({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      connectionId: calendar.connectionId,
      providerCalendarId: calendar.providerCalendarId,
      displayName: calendar.displayName,
      color: calendar.color,
      eventLabels: calendar.eventLabels,
      active: true,
      primary: calendar.primary,
      accessRole: calendar.accessRole,
      capabilities: calendar.capabilities,
      createsGoogleMeet: calendar.createsGoogleMeet,
    });
    const requeued = await enqueue(resource, "initialImport");
    expect(requeued.state).toBe("pending");
  });

  it("settles a durable calendarList discovery failure instead of burning the retry ladder", async () => {
    const connection = await connections.upsertByProviderAccount({
      tenantId: objectId(),
      principalId: objectId(),
      provider: "google",
      account: {
        providerAccountId: "acct-not-cal",
        email: "nocal@example.com",
        displayName: "No Cal",
      },
      capabilities: ["readEvents", "readBusy", "writeEvents"],
      state: "importing",
      stateReason: null,
    });
    const job = await jobs.enqueue({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceId: null,
      commandId: null,
      kind: "calendarListSync",
      priority: 0,
      runAfter: now(),
      coalescingKey: `calendarListSync:${connection._id}`,
    });
    const failingDiscovery: ProviderCalendarAdapter = {
      discoverCalendars: async () => {
        throw new ProviderCalendarError(
          "discoveryFailed",
          "Google rejected the calendar list read",
          {
            cause: new Error(
              "The user must be signed up for Google Calendar. (HTTP 403, reason notACalendarUser)",
            ),
          },
        );
      },
    };

    const { worker: w, drops } = workerRecordingDrops(
      new FakeReader([]),
      failingDiscovery,
    );
    await w.runOnce();

    expect(
      await jobs.findById(connection.tenantId, connection.principalId, job._id),
    ).toBeNull();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain("notACalendarUser");

    const listResource = (
      await resources.listByConnection(
        connection.tenantId,
        connection.principalId,
        connection._id,
      )
    ).find((resource) => resource.resourceKind === "calendarList");
    expect(listResource?.lastReadFailureAt).toEqual(now());

    // Drop frees the coalescing key so rediscovery/reconnect can re-enqueue.
    const requeued = await jobs.enqueue({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceId: null,
      commandId: null,
      kind: "calendarListSync",
      priority: 0,
      runAfter: now(),
      coalescingKey: `calendarListSync:${connection._id}`,
    });
    expect(requeued.state).toBe("pending");
  });

  it("drops a persistent events.list 401 instead of burning the retry ladder", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");
    const drops: string[] = [];
    const errors: Error[] = [];
    const w = new SyncJobWorker(
      deps(
        new FakeReader(
          [],
          new ProviderEventReadError(
            "authExpired",
            "Google rejected the token",
          ),
        ),
      ),
      OWNER,
      {
        now,
        onDrop: (_job, reason) => drops.push(reason),
        onError: (error) => {
          if (error instanceof Error) errors.push(error);
        },
      },
    );

    await w.runOnce();

    expect(
      await jobs.findById(resource.tenantId, resource.principalId, job._id),
    ).toBeNull();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain("authorizationRevoked");
    // Must not log "Sync job engine failed" — that fingerprint reopened the
    // PostHog incident when 401s were retried as transient.
    expect(errors).toEqual([]);
  });

  it("settles a durably-rejected read instead of burning the retry ladder", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const job = await enqueue(resource, "incrementalPull");

    const { worker: w, drops } = workerRecordingDrops(
      new FakeReader(
        [],
        new ProviderEventReadError("readFailed", "Google rejected the read", {
          cause: new Error("Not Found (HTTP 404, reason notFound)"),
        }),
      ),
    );
    await w.runOnce();

    // Settled and removed — NOT left pending for 20 more attempts, and not
    // parked in state:"failed" where it would need an operator to clear it.
    expect(
      await jobs.findById(resource.tenantId, resource.principalId, job._id),
    ).toBeNull();
    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain("HTTP 404");
  });

  it("keeps the coalescing key reusable after a durable read failure", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await enqueue(resource, "incrementalPull");

    await worker(
      new FakeReader([], new ProviderEventReadError("readFailed", "rejected")),
    ).runOnce();

    // The whole reason this settles as a drop rather than failureClass
    // "permanent": a failed row keeps its key and enqueue only $setOnInsert's,
    // so a re-share/reconnect could never restart sync for this resource.
    const requeued = await enqueue(resource, "incrementalPull");
    expect(requeued.state).toBe("pending");
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({ coalescingKey: `incrementalPull:${resource._id}` }),
    ).toBe(1);
  });

  it("records a durable read failure on the resource so health can see it", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await enqueue(resource, "incrementalPull");

    await worker(
      new FakeReader(
        [],
        new ProviderEventReadError("readFailed", "Google rejected the read", {
          cause: new Error("Not Found (HTTP 404, reason notFound)"),
        }),
      ),
    ).runOnce();

    // Dropping the job erases its evidence, so the resource marker is the only
    // durable trace left for connection health and triage.
    const after = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(after?.lastReadFailureAt).toEqual(now());
    expect(after?.lastReadFailureDetail).toContain("HTTP 404");
    expect(after?.lastReadFailureDetail).toContain("notFound");
  });

  it("clears the read-failure marker once the calendar reads again", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await enqueue(resource, "incrementalPull");
    await worker(
      new FakeReader([], new ProviderEventReadError("readFailed", "rejected")),
    ).runOnce();

    // The calendar becomes readable again and a fresh pull succeeds.
    await enqueue(resource, "incrementalPull");
    await worker(
      new FakeReader([pageOf([single("ok")], { nextSyncToken: "cursor-1" })]),
    ).runOnce();

    const after = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(after?.lastReadFailureAt).toBeNull();
    expect(after?.lastReadFailureDetail).toBeNull();
  });

  it("drains every due job and then reports how many it processed", async () => {
    const calendarA = await seedCalendar();
    const calendarB = await seedCalendar();
    const resourceA = await seedResource(calendarA, "cursor-a");
    const resourceB = await seedResource(calendarB, "cursor-b");
    await enqueue(resourceA, "incrementalPull");
    await enqueue(resourceB, "incrementalPull");

    const processed = await worker(
      new FakeReader([
        pageOf([single("a")], { nextSyncToken: "cursor-a1" }),
        pageOf([single("b")], { nextSyncToken: "cursor-b1" }),
      ]),
    ).drain();

    // Four, not two: neither seeded resource has a push channel, so each
    // applied pull enqueues a subscriptionMaintain followup that this same
    // drain then picks up. That is the property under test — drain keeps going
    // until nothing is due, including work spawned partway through it.
    expect(processed).toBe(4);
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({ state: "pending", runAfter: { $lte: now() } }),
    ).toBe(0);
  });
});
