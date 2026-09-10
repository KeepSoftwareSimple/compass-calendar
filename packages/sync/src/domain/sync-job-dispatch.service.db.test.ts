import { faker } from "@faker-js/faker";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import {
  ensureEventsResource,
  FakeReader,
  fakeResolveAdapters,
  pageOf as page,
  seedProviderCalendar,
  singleEvent as single,
  fakeTokenSource as tokenSource,
} from "@sync/__tests__/helpers/fixtures";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  dispatchSyncJob,
  type SyncJobDispatchDeps,
} from "@sync/domain/sync-job-dispatch.service";
import { ProviderNotConfiguredError } from "@sync/providers/provider-adapters";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import {
  type ProviderCalendarAdapter,
  ProviderCalendarError,
} from "@sync/providers/provider-calendar.port";
import {
  ProviderEventReadError,
  type ProviderEventReader,
} from "@sync/providers/provider-event-reader.port";
import { ProviderNotificationError } from "@sync/providers/provider-notifications.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type JobRecord } from "@sync/storage/contracts/job.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type ProviderConnectionRecord } from "@sync/storage/contracts/provider-connection.contracts";
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

// A notification adapter that records watch calls and returns a fixed channel,
// so a subscriptionMaintain dispatch runs without a network round-trip.
const notifications = {
  watched: [] as string[],
  calendarListWatched: [] as string[],
  watch: async (input: { channelId: string; calendarId?: string }) => {
    if (input.calendarId === undefined) {
      notifications.calendarListWatched.push(input.channelId);
      return {
        channelId: input.channelId,
        resourceId: "provider-calendar-list",
        expiresAt: new Date("2026-07-17T00:00:00.000Z"),
      };
    }
    notifications.watched.push(input.channelId);
    return {
      channelId: input.channelId,
      resourceId: "provider-resource",
      expiresAt: new Date("2026-07-17T00:00:00.000Z"),
    };
  },
  stopChannel: async () => {},
  parseNotification: () => null,
};

// A calendar-discovery adapter that returns one active calendar, so a
// calendarListSync dispatch runs without a network round-trip.
const discovery = {
  discoverCalendars: async () => ({
    calendars: [
      {
        providerCalendarId: "primary@google.com",
        displayName: "Google",
        color: null,
        primary: true,
        active: true,
        accessRole: "owner" as const,
        capabilities: {
          canReadEvents: true,
          canWriteEvents: true,
          canReadBusy: true,
          canInviteAttendees: true,
        },
        eventLabels: [],
        createsGoogleMeet: true,
      },
    ],
    cursor: "cursor-1",
  }),
};

const defaultGoogleConnection = (
  tenantId: ProviderConnectionRecord["tenantId"],
  principalId: ProviderConnectionRecord["principalId"],
  id: ProviderConnectionRecord["_id"],
): ProviderConnectionRecord => ({
  _id: id,
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
  diagnosticKey: "0123456789abcdef0123456789abcdef",
  disconnectedAt: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  createdAt: now(),
  updatedAt: now(),
});

const googleProviderCapabilities = [
  "readEvents",
  "writeEvents",
  "readBusy",
  "inviteAttendees",
  "changeNotifications",
  "incrementalChanges",
] as const;

describe("dispatchSyncJob", () => {
  const storage = setupSyncStorage(import.meta.url);
  let events: EventRepository;
  let occurrences: EventOccurrenceRepository;
  let resources: SyncResourceRepository;
  let calendars: ProviderCalendarRepository;
  let commands: CommandRepository;
  let jobs: JobRepository;
  let invalidations: InvalidationRepository;
  let credentials: CredentialRepository;
  // Dispatch resolves the connection for a calendarListSync job; a test sets what
  // findById returns without seeding a full connection record.
  // undefined: synthesize a google connection; null: no connection; else: use stub.
  let stubbedConnection: ProviderConnectionRecord | null | undefined;

  beforeEach(() => {
    events = new EventRepository(storage.db());
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    resources = new SyncResourceRepository(storage.db());
    calendars = new ProviderCalendarRepository(storage.db());
    commands = new CommandRepository(storage.db());
    jobs = new JobRepository(storage.db());
    invalidations = new InvalidationRepository(storage.db());
    credentials = new CredentialRepository(storage.db());
    stubbedConnection = undefined;
  });

  const connections = {
    findById: async (
      tenantId: ProviderConnectionRecord["tenantId"],
      principalId: ProviderConnectionRecord["principalId"],
      id: ProviderConnectionRecord["_id"],
    ) => {
      if (stubbedConnection === null) return null;
      if (stubbedConnection) return stubbedConnection;
      return defaultGoogleConnection(tenantId, principalId, id);
    },
    updateDerivedState: async (
      tenantId: ProviderConnectionRecord["tenantId"],
      principalId: ProviderConnectionRecord["principalId"],
      id: ProviderConnectionRecord["_id"],
      fields: {
        state: ProviderConnectionRecord["state"];
        stateReason: ProviderConnectionRecord["stateReason"];
        lastSyncedAt: Date | null;
        lastHealthyAt: Date | null;
      },
      at?: Date,
    ) => {
      const real = new ProviderConnectionRepository(storage.db());
      return real.updateDerivedState(tenantId, principalId, id, fields, at);
    },
  } as unknown as SyncJobDispatchDeps["connections"];

  const deps = (
    reader: FakeReader,
    custody: SyncJobDispatchDeps["custody"] = tokenSource,
    notificationsOverride = notifications,
    discoveryOverride: ProviderCalendarAdapter = discovery,
  ): SyncJobDispatchDeps => ({
    events,
    occurrences,
    resources,
    calendars,
    connections,
    credentials,
    resolveAdapters: fakeResolveAdapters(reader, {
      calendars: discoveryOverride,
      notifications: notificationsOverride,
    }),
    jobs,
    commands,
    custody,
    callbackUrlFor: () => "https://sync.example/sync/notifications/google",
    providerCapabilities: () => googleProviderCapabilities,
    invalidations,
  });

  const seedCalendar = (): Promise<ProviderCalendarRecord> =>
    seedProviderCalendar(calendars);

  const seedResource = (
    calendar: ProviderCalendarRecord,
    cursor: string | null,
  ): Promise<SyncResourceRecord> =>
    ensureEventsResource(resources, calendar, { cursor, now });

  const jobFor = (
    resource: SyncResourceRecord,
    kind: JobRecord["kind"],
  ): JobRecord =>
    ({
      _id: objectId(),
      tenantId: resource.tenantId,
      principalId: resource.principalId,
      connectionId: resource.connectionId,
      resourceId: resource._id,
      commandId: null,
      kind,
      priority: 0,
      state: "claimed",
      runAfter: now(),
      attempt: 0,
      coalescingKey: `${kind}:${resource._id}`,
      leaseOwner: "worker-1",
      leaseExpiresAt: now(),
      failureClass: null,
      createdAt: now(),
      updatedAt: now(),
    }) as JobRecord;

  it("invalidates after an empty incremental pull retry once the cursor already advanced", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-1");
    const reader = new FakeReader([page([], { nextSyncToken: "cursor-1" })]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );
    // Subject is the invalidation feed; this seed has no channel, so it also
    // carries a bootstrap followup that is not what this test is about.
    expect(outcome.result).toBe("done");

    const feed = await storage
      .db()
      .collection(SYNC_COLLECTIONS.invalidations)
      .find({ principalId: calendar.principalId })
      .toArray();
    expect(feed).toHaveLength(1);
    expect(feed[0]?.invalidation).toEqual({
      kind: "calendar",
      connectionId: calendar.connectionId,
      calendarId: calendar._id,
    });
  });

  it("settles an applied incremental pull as done when the channel is already live", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await resources.updateSubscription(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      {
        subscriptionId: "channel-1",
        subscriptionResourceId: "provider-resource-1",
        subscriptionToken: "token-1",
        subscriptionExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    );
    const reader = new FakeReader([
      page([single("new-1")], { nextSyncToken: "cursor-1" }),
    ]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );
    expect(outcome).toEqual({ result: "done" });

    const feed = await storage
      .db()
      .collection(SYNC_COLLECTIONS.invalidations)
      .find({ principalId: calendar.principalId })
      .toArray();
    expect(feed).toHaveLength(1);
    expect(feed[0]?.invalidation).toEqual({
      kind: "calendar",
      connectionId: calendar.connectionId,
      calendarId: calendar._id,
    });
  });

  it("re-pulls when a notification lands after the pull already read the provider", async () => {
    // The notification's own enqueue coalesces onto this job's CLAIMED row and
    // does nothing, and the row is deleted the moment the job settles — so
    // without this second pass the change waits for the reconcile sweep's
    // 15-minute staleness threshold instead of the ~30s the push path promises.
    // A followup job cannot do it: the worker enqueues followups BEFORE
    // completing, so one sharing `incrementalPull:<resourceId>` would coalesce
    // onto the very row it replaces.
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const reads: string[] = [];

    const reader: ProviderEventReader = {
      listEventPage: async () => {
        reads.push("read");
        if (reads.length === 1) {
          // The notification arrives now — after this pass has read Google.
          await resources.markChangeNotified(
            calendar.tenantId,
            calendar.principalId,
            resource._id,
            new Date("2026-07-10T00:00:03.000Z"),
          );
          return page([single("first")], { nextSyncToken: "cursor-1" });
        }
        return page([single("second")], { nextSyncToken: "cursor-2" });
      },
    };

    await dispatchSyncJob(
      {
        ...deps(new FakeReader([])),
        resolveAdapters: fakeResolveAdapters(reader),
      },
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(reads).toHaveLength(2);
    // The second pass served the marker, so nothing is left pending.
    const stored = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(stored?.changeNotifiedAt).toBeNull();
    expect(stored?.syncCursor).toBe("cursor-2");
  });

  it("stops re-pulling after the pass bound and leaves the rest to the sweep", async () => {
    // A calendar changing on every pass must not hold a worker lane forever.
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const reads: string[] = [];
    const warnings: string[] = [];

    const reader: ProviderEventReader = {
      listEventPage: async () => {
        reads.push("read");
        // Every pass is overtaken by a newer notification.
        await resources.markChangeNotified(
          calendar.tenantId,
          calendar.principalId,
          resource._id,
          new Date(`2026-07-10T00:00:0${reads.length}.000Z`),
        );
        return page([single(`e-${reads.length}`)], {
          nextSyncToken: `cursor-${reads.length}`,
        });
      },
    };

    await dispatchSyncJob(
      {
        ...deps(new FakeReader([])),
        resolveAdapters: fakeResolveAdapters(reader),
        log: { warn: (message) => warnings.push(message) },
      },
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(reads).toHaveLength(3);
    expect(
      warnings.some((message) => message.includes("after 3 pull passes")),
    ).toBe(true);
    // Marker deliberately left set so the reconcile sweep picks up the rest.
    const stored = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(stored?.changeNotifiedAt).not.toBeNull();
  });

  it("bootstraps a push channel when an applied pull finds the calendar has none", async () => {
    // The initialImport followup used to be the only thing that ever opened a
    // channel, and the renewal sweep only renews channels that already exist,
    // so a calendar imported by any other route could never become watchable.
    // Production preseeded 938 calendars straight into the store during the
    // Sync cutover: cursors present, syncing fine, no channel, and nothing in
    // the system able to give them one (2026-08-01).
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    expect(resource.subscriptionId).toBeNull();
    const reader = new FakeReader([
      page([single("new-1")], { nextSyncToken: "cursor-1" }),
    ]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );

    if (outcome.result !== "done" || !outcome.followup) {
      throw new Error("expected a followup");
    }
    expect(outcome.followup.kind).toBe("subscriptionMaintain");
    expect(outcome.followup.coalescingKey).toBe(
      `subscriptionMaintain:${resource._id}`,
    );
    expect(outcome.followup.resourceId).toBe(resource._id);
  });

  it("skips the channel bootstrap when the provider has terminally refused a watch", async () => {
    // Once maintainSubscription persists watchUnsupportedAt, re-attempting a
    // watch on every pull is pure waste; the daily calendar-list full pass
    // clears the marker for one fresh attempt.
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await resources.markWatchUnsupported(
      resource.tenantId,
      resource.principalId,
      resource._id,
      now(),
    );
    const reader = new FakeReader([
      page([single("new-1")], { nextSyncToken: "cursor-1" }),
    ]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(outcome).toEqual({ result: "done" });
  });

  it("hands off an expired-cursor pull to a repair followup", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "stale-cursor");
    const reader = new FakeReader(
      [],
      new ProviderEventReadError("cursorExpired", "gone"),
    );

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );
    if (outcome.result !== "done" || !outcome.followup) {
      throw new Error("expected a followup");
    }
    expect(outcome.followup.kind).toBe("repair");
    expect(outcome.followup.coalescingKey).toBe(`repair:${resource._id}`);
    expect(outcome.followup.resourceId).toBe(resource._id);
  });

  // A calendar whose provider never sustains an incremental cursor (Google's
  // derived holiday calendars 410 a token minutes old) used to re-run
  // pull -> repair -> pull every ~45s forever: one prod resource reached
  // activeGeneration 1919 in four weeks (2026-08-23).
  it("counts consecutive cursor expiries and eventually holds off the pull", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "stale-cursor");
    const alwaysExpired = () =>
      new FakeReader([], new ProviderEventReadError("cursorExpired", "gone"));

    // The first two laps are deliberately free, so an ordinary calendar whose
    // token genuinely aged out heals with no added latency.
    for (const expectedStreak of [1, 2]) {
      const outcome = await dispatchSyncJob(
        deps(alwaysExpired()),
        jobFor(resource, "incrementalPull"),
        now,
      );
      expect(outcome.result).toBe("done");
      const stored = await resources.findById(
        calendar.tenantId,
        calendar.principalId,
        resource._id,
      );
      expect(stored?.cursorExpiredStreak).toBe(expectedStreak);
      expect(stored?.cursorExpiredBackoffUntil).toEqual(now());
    }

    // The third lap is where the cursor is judged unrecoverable and the
    // hold-off starts widening.
    const third = await dispatchSyncJob(
      deps(alwaysExpired()),
      jobFor(resource, "incrementalPull"),
      now,
    );
    expect(third.result).toBe("done");
    const held = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(held?.cursorExpiredStreak).toBe(3);
    expect(held?.cursorExpiredBackoffUntil).toEqual(
      new Date(now().getTime() + 5 * 60_000),
    );
  });

  // The behaviour the feature exists for, seeded directly rather than reached
  // through three laps, so it still runs when the ladder above changes.
  it("settles a pull inside the hold-off without touching the provider", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "stale-cursor");
    await resources.recordCursorExpiry(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      new Date(now().getTime() + 5 * 60_000),
    );

    const reader = new FakeReader(
      [],
      new ProviderEventReadError("cursorExpired", "gone"),
    );
    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(outcome.result).toBe("drop");
    expect(reader.calls).toHaveLength(0);
  });

  it("clears the expiry streak once a pull applies through the cursor again", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "stale-cursor");

    await dispatchSyncJob(
      deps(
        new FakeReader([], new ProviderEventReadError("cursorExpired", "gone")),
      ),
      jobFor(resource, "incrementalPull"),
      now,
    );
    const expired = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(expired?.cursorExpiredStreak).toBe(1);

    await dispatchSyncJob(
      deps(
        new FakeReader([
          page([single("new-1")], { nextSyncToken: "cursor-2" }),
        ]),
      ),
      jobFor(resource, "incrementalPull"),
      now,
    );
    const healed = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(healed?.cursorExpiredStreak).toBe(0);
    expect(healed?.cursorExpiredBackoffUntil).toBeNull();
  });

  // Both stale-resource finders order by lastAttemptAt, so a drop that did not
  // stamp it kept the resource pinned to the front of every sweep and it was
  // re-enqueued forever (22 such drops in 19 minutes on prod, 2026-08-23).
  it("stamps the attempt when dropping a job for an inactive calendar", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-1");
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.providerCalendars)
      .updateOne(
        { _id: mongoObjectId(calendar._id) },
        { $set: { active: false } },
      );

    const reader = new FakeReader([]);
    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(outcome.result).toBe("drop");
    expect(reader.calls).toHaveLength(0);
    const stored = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(stored?.lastAttemptAt).toEqual(now());
  });

  it("clears a lingering push channel when dropping a job for an inactive calendar", async () => {
    // The renewal sweep sorts on subscriptionExpiresAt alone, so a channel
    // left on an inactive calendar would win the head of every sweep forever
    // — the drop is where the invariant is enforced regardless of how the
    // calendar became inactive.
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-1");
    await resources.updateSubscription(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      {
        subscriptionId: "channel-1",
        subscriptionResourceId: "resource-1",
        subscriptionToken: "token-1",
        subscriptionExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
      },
    );
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.providerCalendars)
      .updateOne(
        { _id: mongoObjectId(calendar._id) },
        { $set: { active: false } },
      );

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([])),
      jobFor(resource, "subscriptionMaintain"),
      now,
    );

    expect(outcome.result).toBe("drop");
    const stored = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    );
    expect(stored?.subscriptionId).toBeNull();
    expect(stored?.subscriptionExpiresAt).toBeNull();
  });

  it("hands off a pull on a never-imported resource to an initial import", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null); // no cursor
    const reader = new FakeReader([]); // pull returns notImported before reading

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "incrementalPull"),
      now,
    );
    if (outcome.result !== "done" || !outcome.followup) {
      throw new Error("expected a followup");
    }
    expect(outcome.followup.kind).toBe("initialImport");
  });

  it("settles a completed repair as done", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    const reader = new FakeReader([
      page([single("keep")], { nextSyncToken: "cursor-1" }),
    ]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "repair"),
      now,
    );
    expect(outcome).toMatchObject({
      result: "done",
      followup: { kind: "subscriptionMaintain" },
    });
  });

  it("retries a repair that did not complete", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    // A page with no nextSyncToken leaves the repair unable to trust the rebuild.
    const reader = new FakeReader([page([single("keep")])]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "repair"),
      now,
    );
    expect(outcome).toEqual({
      result: "retry",
      reason: "repair did not complete",
    });
  });

  it("runs an initial import and hands off to a subscription bootstrap", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0"); // already imported
    const reader = new FakeReader([]); // import no-ops on an existing cursor

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "initialImport"),
      now,
    );
    // Even an idempotent no-op import ensures the push channel gets opened.
    if (outcome.result !== "done" || !outcome.followup) {
      throw new Error("expected a followup");
    }
    expect(outcome.followup.kind).toBe("subscriptionMaintain");
    expect(outcome.followup.coalescingKey).toBe(
      `subscriptionMaintain:${resource._id}`,
    );
  });

  it("drops the job with a reason and discards the credential when the token is revoked", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const reader = new FakeReader([]);
    const discarded: string[] = [];
    const revokedCustody: SyncJobDispatchDeps["custody"] = {
      getValidAccessToken: async () => {
        throw new ProviderAuthError(
          "authorizationRevoked",
          "refresh token revoked",
        );
      },
      discardRevoked: async (connectionId) => {
        discarded.push(connectionId);
      },
      invalidateAccessToken: async () => {},
    };

    const outcome = await dispatchSyncJob(
      deps(reader, revokedCustody),
      jobFor(resource, "incrementalPull"),
      now,
    );

    // A reasoned drop (settles identically to done, but visible): the silent
    // done here made a mass credential problem look like a dead sweep.
    expect(outcome.result).toBe("drop");
    if (outcome.result === "drop") {
      expect(outcome.reason).toContain("authorizationRevoked");
      expect(outcome.reason).toContain(calendar.connectionId);
    }
    expect(discarded).toEqual([calendar.connectionId]);
  });

  it("leaves a transient refresh failure for the worker to retry", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const reader = new FakeReader([]);
    const discarded: string[] = [];
    const flakyCustody: SyncJobDispatchDeps["custody"] = {
      getValidAccessToken: async () => {
        throw new ProviderAuthError("refreshFailed", "network blip");
      },
      discardRevoked: async (connectionId) => {
        discarded.push(connectionId);
      },
      invalidateAccessToken: async () => {},
    };

    await expect(
      dispatchSyncJob(
        deps(reader, flakyCustody),
        jobFor(resource, "incrementalPull"),
        now,
      ),
    ).rejects.toThrow(ProviderAuthError);
    expect(discarded).toEqual([]);
  });

  it("drops a job after consecutive refreshFailed attempts so 401s do not burn the ladder", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await seedOauthCredential(credentials, {
      connectionId: calendar.connectionId,
      provider: "google",
      refreshToken: "refresh",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    for (let i = 0; i < 3; i += 1) {
      await credentials.incrementRefreshFailure(calendar.connectionId);
    }
    const reader = new FakeReader([]);
    const discarded: string[] = [];
    const flakyCustody: SyncJobDispatchDeps["custody"] = {
      getValidAccessToken: async () => {
        throw new ProviderAuthError("refreshFailed", "network blip");
      },
      discardRevoked: async (connectionId) => {
        discarded.push(connectionId);
      },
      invalidateAccessToken: async () => {},
    };

    const outcome = await dispatchSyncJob(
      deps(reader, flakyCustody),
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(outcome.result).toBe("drop");
    if (outcome.result === "drop") {
      expect(outcome.reason).toContain("token refresh failed 3 time(s)");
    }
    expect(discarded).toEqual([]);
    const after = await credentials.findByConnection(calendar.connectionId);
    expect(
      (after as { refreshFailureCount?: number } | null)?.refreshFailureCount,
    ).toBe(3);
  });

  it("does not drop a refreshFailed job just because other retries already ran", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    await seedOauthCredential(credentials, {
      connectionId: calendar.connectionId,
      provider: "google",
      refreshToken: "refresh",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    const reader = new FakeReader([]);
    const job = {
      ...jobFor(resource, "incrementalPull"),
      attempt: 5,
    };

    await expect(
      dispatchSyncJob(
        deps(reader, {
          getValidAccessToken: async () => {
            throw new ProviderAuthError("refreshFailed", "network blip");
          },
          discardRevoked: async () => {},
          invalidateAccessToken: async () => {},
        }),
        job,
        now,
      ),
    ).rejects.toThrow(ProviderAuthError);
  });

  it("remints the access token in-process and completes a pull after a one-off 401", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const reader = new FakeReader(
      [page([], { nextSyncToken: "cursor-1" })],
      new ProviderEventReadError("authExpired", "Google rejected the token"),
      true,
    );
    const invalidated: string[] = [];
    let minted = 0;
    const authExpiredCustody: SyncJobDispatchDeps["custody"] = {
      getValidAccessToken: async () => {
        minted += 1;
        return minted === 1 ? "stale-token" : "fresh-token";
      },
      discardRevoked: async () => {},
      invalidateAccessToken: async (connectionId) => {
        invalidated.push(connectionId);
      },
    };

    const outcome = await dispatchSyncJob(
      deps(reader, authExpiredCustody),
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(outcome.result).toBe("done");
    expect(invalidated).toEqual([calendar.connectionId]);
    expect(minted).toBe(2);
  });

  it("drops a pull when a freshly minted token is still rejected with 401", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const reader = new FakeReader(
      [],
      new ProviderEventReadError("authExpired", "Google rejected the token"),
    );
    const discarded: string[] = [];
    const invalidated: string[] = [];
    const authExpiredCustody: SyncJobDispatchDeps["custody"] = {
      ...tokenSource,
      discardRevoked: async (connectionId) => {
        discarded.push(connectionId);
      },
      invalidateAccessToken: async (connectionId) => {
        invalidated.push(connectionId);
      },
    };

    const outcome = await dispatchSyncJob(
      deps(reader, authExpiredCustody),
      jobFor(resource, "incrementalPull"),
      now,
    );

    expect(outcome.result).toBe("drop");
    if (outcome.result === "drop") {
      expect(outcome.reason).toContain("authorizationRevoked");
    }
    expect(invalidated).toEqual([calendar.connectionId]);
    expect(discarded).toEqual([calendar.connectionId]);
  });

  it("drops a job whose resource no longer exists", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0");
    const ghost = { ...resource, _id: objectId() };
    const reader = new FakeReader([]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(ghost, "incrementalPull"),
      now,
    );
    expect(outcome).toEqual({
      result: "drop",
      reason: "resource no longer exists",
    });
  });

  it("settles a subscriptionMaintain job as done, opening a channel", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, "cursor-0"); // no subscription
    notifications.watched = [];
    const reader = new FakeReader([]);

    const outcome = await dispatchSyncJob(
      deps(reader),
      jobFor(resource, "subscriptionMaintain"),
      now,
    );

    expect(outcome).toEqual({ result: "done" });
    // The channel was actually opened and persisted for the resource.
    expect(notifications.watched).toHaveLength(1);
    const saved = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(saved?.subscriptionResourceId).toBe("provider-resource");
  });

  it("does not declare a fresh calendar ready until the post-watch pull completes", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    notifications.watched = [];

    const importOutcome = await dispatchSyncJob(
      deps(
        new FakeReader([
          page([single("imported")]),
          page([single("imported")], { nextSyncToken: "cursor-1" }),
        ]),
      ),
      jobFor(resource, "initialImport"),
      now,
    );
    expect(importOutcome).toMatchObject({
      result: "done",
      followup: { kind: "subscriptionMaintain" },
    });
    expect(
      (
        await resources.findById(
          resource.tenantId,
          resource.principalId,
          resource._id,
        )
      )?.bootstrapState,
    ).toBe("watching");

    const subscriptionOutcome = await dispatchSyncJob(
      deps(new FakeReader([])),
      jobFor(resource, "subscriptionMaintain"),
      now,
    );
    expect(subscriptionOutcome).toMatchObject({
      result: "done",
      followup: {
        kind: "bootstrapCatchup",
        coalescingKey: `bootstrapCatchup:${resource._id}`,
      },
    });
    expect(
      (
        await resources.findById(
          resource.tenantId,
          resource.principalId,
          resource._id,
        )
      )?.bootstrapState,
    ).toBe("catchingUp");

    const catchupOutcome = await dispatchSyncJob(
      deps(
        new FakeReader([
          page([single("created-after-import")], { nextSyncToken: "cursor-2" }),
        ]),
      ),
      jobFor(resource, "bootstrapCatchup"),
      now,
    );
    expect(catchupOutcome).toEqual({ result: "done" });
    expect(
      (
        await resources.findById(
          resource.tenantId,
          resource.principalId,
          resource._id,
        )
      )?.bootstrapState,
    ).toBe("ready");
  });

  it("completes bootstrap straight to ready when the provider cannot watch the calendar", async () => {
    // The 2026-08-04 staging loop: a calendar the provider refuses to watch
    // (Google's public holiday calendars) used to still go through
    // catchingUp -> bootstrapCatchup, whose pull is the ONLY place "ready" is
    // set. A calendar with an expired sync cursor as well as no watch support
    // then cycled cursorExpired -> repair -> subscriptionMaintain ->
    // unsupported -> catchingUp -> cursorExpired forever, never reaching
    // ready. There is no watch to catch up to, so unsupported must complete
    // bootstrap directly.
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    const refusing = {
      ...notifications,
      watch: async () => {
        throw new ProviderNotificationError(
          "watchUnsupported",
          "push not supported for this calendar",
        );
      },
    };

    const importOutcome = await dispatchSyncJob(
      deps(
        new FakeReader([
          page([single("imported")]),
          page([single("imported")], { nextSyncToken: "cursor-1" }),
        ]),
      ),
      jobFor(resource, "initialImport"),
      now,
    );
    expect(importOutcome).toMatchObject({
      result: "done",
      followup: { kind: "subscriptionMaintain" },
    });

    const subscriptionOutcome = await dispatchSyncJob(
      deps(new FakeReader([]), tokenSource, refusing),
      jobFor(resource, "subscriptionMaintain"),
      now,
    );
    expect(subscriptionOutcome).toEqual({ result: "done" });

    const saved = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(saved?.bootstrapState).toBe("ready");
    expect(saved?.subscriptionId).toBeNull();

    const feed = await storage
      .db()
      .collection(SYNC_COLLECTIONS.invalidations)
      .find({ principalId: calendar.principalId })
      .toArray();
    // One from the import's own windowed-pass/full-finish notifications, one
    // more from unsupported completing bootstrap.
    expect(feed.length).toBeGreaterThanOrEqual(2);
  });

  it("completes bootstrap to ready when the provider lacks changeNotifications", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    notifications.watched = [];
    const pollOnlyNotifications = {
      ...notifications,
      watch: async () => {
        throw new Error("watch must not run for poll-only providers");
      },
    };

    const importOutcome = await dispatchSyncJob(
      deps(
        new FakeReader([
          page([single("imported")]),
          page([single("imported")], { nextSyncToken: "cursor-1" }),
        ]),
      ),
      jobFor(resource, "initialImport"),
      now,
    );
    expect(importOutcome).toMatchObject({
      result: "done",
      followup: { kind: "subscriptionMaintain" },
    });

    const subscriptionOutcome = await dispatchSyncJob(
      {
        ...deps(new FakeReader([]), tokenSource, pollOnlyNotifications),
        providerCapabilities: () => ["readEvents", "incrementalChanges"],
      },
      jobFor(resource, "subscriptionMaintain"),
      now,
    );
    expect(subscriptionOutcome).toEqual({ result: "done" });
    expect(notifications.watched).toHaveLength(0);

    const saved = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(saved?.bootstrapState).toBe("ready");
    expect(saved?.subscriptionId).toBeNull();
  });

  it("completes bootstrap on durable watchFailed instead of burning retries", async () => {
    // 2026-08-07 prod: ProviderNotificationError watchFailed ("Google refused
    // to open the channel") was rethrown from maintainSubscription, hit the
    // worker's generic catch as retryableTransient, and spent all 20 attempts
    // — 78 PostHog exceptions for one job, bootstrap never reached ready.
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    const refusing = {
      ...notifications,
      watch: async () => {
        throw new ProviderNotificationError(
          "watchFailed",
          "Google refused to open the channel (HTTP 403, reason forbidden)",
        );
      },
    };

    const importOutcome = await dispatchSyncJob(
      deps(
        new FakeReader([
          page([single("imported")]),
          page([single("imported")], { nextSyncToken: "cursor-1" }),
        ]),
      ),
      jobFor(resource, "initialImport"),
      now,
    );
    expect(importOutcome).toMatchObject({
      result: "done",
      followup: { kind: "subscriptionMaintain" },
    });

    const subscriptionOutcome = await dispatchSyncJob(
      deps(new FakeReader([]), tokenSource, refusing),
      jobFor(resource, "subscriptionMaintain"),
      now,
    );
    expect(subscriptionOutcome).toEqual({ result: "done" });

    const saved = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(saved?.bootstrapState).toBe("ready");
    expect(saved?.subscriptionId).toBeNull();
  });

  async function seedConnectedCalendar() {
    const realConnections = new ProviderConnectionRepository(storage.db());
    const connection = await realConnections.upsertByProviderAccount({
      tenantId: objectId(),
      principalId: objectId(),
      provider: "google",
      account: {
        providerAccountId: "acct-1",
        email: "user@example.com",
        displayName: "User",
      },
      capabilities: ["readEvents", "readBusy", "writeEvents"],
      state: "importing",
      stateReason: null,
    });
    await seedOauthCredential(credentials, {
      connectionId: connection._id,
      provider: "google",
      refreshToken: "refresh",
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
    });
    const calendar = await seedProviderCalendar(calendars, {
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
    stubbedConnection = connection;
    return { connection, calendar };
  }

  async function connectionInvalidations(principalId: string) {
    const feed = await storage
      .db()
      .collection(SYNC_COLLECTIONS.invalidations)
      .find({ principalId })
      .toArray();
    return feed.filter(
      (row) =>
        (row.invalidation as { kind?: string } | undefined)?.kind ===
        "connection",
    );
  }

  it("appends a connection invalidation when bootstrapCatchup completes", async () => {
    const { connection, calendar } = await seedConnectedCalendar();
    const resource = await seedResource(calendar, "cursor-1");

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([page([], { nextSyncToken: "cursor-2" })])),
      jobFor(resource, "bootstrapCatchup"),
      now,
    );

    expect(outcome).toEqual({ result: "done" });
    expect(await connectionInvalidations(connection.principalId)).toHaveLength(
      1,
    );
  });

  it("appends a connection invalidation when subscriptionMaintain completes unsupported", async () => {
    const { connection, calendar } = await seedConnectedCalendar();
    const resource = await ensureEventsResource(resources, calendar, {
      cursor: "cursor-1",
      bootstrapState: "watching",
      now,
    });
    const refusing = {
      ...notifications,
      watch: async () => {
        throw new ProviderNotificationError(
          "watchUnsupported",
          "push not supported for this calendar",
        );
      },
    };

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([]), tokenSource, refusing),
      jobFor(resource, "subscriptionMaintain"),
      now,
    );

    expect(outcome).toEqual({ result: "done" });
    expect(await connectionInvalidations(connection.principalId)).toHaveLength(
      1,
    );
  });

  it("does not fail the job when connection-state refresh throws", async () => {
    const { calendar } = await seedConnectedCalendar();
    const resource = await seedResource(calendar, "cursor-1");
    const warnings: string[] = [];
    const failingDeps: SyncJobDispatchDeps = {
      ...deps(new FakeReader([page([], { nextSyncToken: "cursor-2" })])),
      connections: {
        findById: async (
          tenantId: ProviderConnectionRecord["tenantId"],
          principalId: ProviderConnectionRecord["principalId"],
          id: ProviderConnectionRecord["_id"],
        ) => {
          if (stubbedConnection === null) return null;
          if (stubbedConnection) return stubbedConnection;
          return defaultGoogleConnection(tenantId, principalId, id);
        },
        updateDerivedState: async () => {
          throw new Error("derived-state write failed");
        },
      } as unknown as SyncJobDispatchDeps["connections"],
      log: { warn: (message) => warnings.push(message) },
    };

    const outcome = await dispatchSyncJob(
      failingDeps,
      jobFor(resource, "bootstrapCatchup"),
      now,
    );

    expect(outcome).toEqual({ result: "done" });
    expect(warnings.some((message) => message.includes("derived-state"))).toBe(
      true,
    );
  });

  const calendarListJob = (
    connectionId: string,
    tenantId: string,
    principalId: string,
  ): JobRecord =>
    ({
      _id: objectId(),
      tenantId,
      principalId,
      connectionId,
      resourceId: null,
      commandId: null,
      kind: "calendarListSync",
      priority: 0,
      state: "claimed",
      runAfter: now(),
      attempt: 0,
      coalescingKey: `calendarListSync:${connectionId}`,
      leaseOwner: "worker-1",
      leaseExpiresAt: now(),
      failureClass: null,
      createdAt: now(),
      updatedAt: now(),
    }) as JobRecord;

  it("routes calendarListSync to discovery and settles done", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const connectionId = objectId();
    stubbedConnection = {
      _id: connectionId,
      tenantId,
      principalId,
    } as ProviderConnectionRecord;

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([])),
      calendarListJob(connectionId, tenantId, principalId),
      now,
    );

    expect(outcome).toMatchObject({
      result: "done",
      followup: { kind: "subscriptionMaintain" },
    });
    // Discovery persisted the calendar and enqueued its initial import.
    const persisted = await calendars.listByConnection(
      tenantId as ProviderCalendarRecord["tenantId"],
      principalId as ProviderCalendarRecord["principalId"],
      connectionId as ProviderCalendarRecord["connectionId"],
    );
    expect(persisted).toHaveLength(1);
    const importCount = await storage
      .db()
      .collection(SYNC_COLLECTIONS.jobs)
      .countDocuments({ kind: "initialImport" });
    expect(importCount).toBe(1);
    const invalidationCount = await storage
      .db()
      .collection(SYNC_COLLECTIONS.invalidations)
      .countDocuments({
        "invalidation.kind": "connection",
        "invalidation.connectionId": connectionId,
      });
    expect(invalidationCount).toBe(1);
  });

  it("re-lists when a notification lands mid-discovery, then clears the marker", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const connectionId = objectId();
    stubbedConnection = {
      _id: connectionId,
      tenantId,
      principalId,
    } as ProviderConnectionRecord;
    // The first pass gets a change notification while it is reading the
    // provider (its enqueue coalesced onto this very job and vanished); the
    // moved marker must make dispatch go round again.
    let calls = 0;
    const restlessDiscovery: ProviderCalendarAdapter = {
      discoverCalendars: async () => {
        calls += 1;
        if (calls === 1) {
          const resource = await storage
            .db()
            .collection(SYNC_COLLECTIONS.syncResources)
            .findOne({ connectionId, resourceKind: "calendarList" });
          await resources.markChangeNotified(
            tenantId as SyncResourceRecord["tenantId"],
            principalId as SyncResourceRecord["principalId"],
            String(resource?._id),
            new Date("2026-07-10T00:00:05.000Z"),
          );
        }
        return discovery.discoverCalendars();
      },
    };

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([]), tokenSource, notifications, restlessDiscovery),
      calendarListJob(connectionId, tenantId, principalId),
      now,
    );

    expect(outcome).toMatchObject({ result: "done" });
    expect(calls).toBe(2);
    // The second pass served the mid-pass change and retired its marker.
    const resource = await storage
      .db()
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne({ connectionId, resourceKind: "calendarList" });
    expect(resource?.changeNotifiedAt).toBeNull();
  });

  it("skips the watch followup when the provider refused calendar-list watch", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const connectionId = objectId();
    stubbedConnection = {
      _id: connectionId,
      tenantId,
      principalId,
    } as ProviderConnectionRecord;
    // Seed a cursored calendarList resource marked unwatchable: the pass runs
    // incrementally (no full-pass clear of the verdict), so the followup gate
    // must leave the refused watch to the daily rediscovery cadence.
    const resource = await resources.ensure({
      tenantId: tenantId as SyncResourceRecord["tenantId"],
      principalId: principalId as SyncResourceRecord["principalId"],
      connectionId: connectionId as SyncResourceRecord["connectionId"],
      resourceKind: "calendarList",
      calendarId: null,
    });
    await resources.advanceCursor(
      resource.tenantId,
      resource.principalId,
      resource._id,
      "cursor-0",
      now(),
    );
    await resources.markWatchUnsupported(
      resource.tenantId,
      resource.principalId,
      resource._id,
      now(),
    );

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([])),
      calendarListJob(connectionId, tenantId, principalId),
      now,
    );

    expect(outcome).toEqual({ result: "done" });
  });

  it("drops a calendarListSync whose connection no longer exists", async () => {
    stubbedConnection = null; // findById returns nothing

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([])),
      calendarListJob(objectId(), objectId(), objectId()),
      now,
    );

    expect(outcome).toEqual({
      result: "drop",
      reason: "connection no longer exists",
    });
  });

  it("drops a revoked calendarListSync with a reason, like the resource-based kinds", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const connectionId = objectId();
    stubbedConnection = {
      _id: connectionId,
      tenantId,
      principalId,
    } as ProviderConnectionRecord;
    const discarded: string[] = [];
    const revokedCustody: SyncJobDispatchDeps["custody"] = {
      getValidAccessToken: async () => {
        throw new ProviderAuthError(
          "authorizationRevoked",
          "refresh token revoked",
        );
      },
      discardRevoked: async (id) => {
        discarded.push(id);
      },
      invalidateAccessToken: async () => {},
    };

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([]), revokedCustody),
      calendarListJob(connectionId, tenantId, principalId),
      now,
    );

    expect(outcome.result).toBe("drop");
    if (outcome.result === "drop") {
      expect(outcome.reason).toContain("authorizationRevoked");
    }
    expect(discarded).toEqual([connectionId]);
  });

  it("drops a durable calendarList discovery failure and marks the calendarList resource", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const connectionId = objectId();
    stubbedConnection = {
      _id: connectionId,
      tenantId,
      principalId,
      provider: "google",
    } as ProviderConnectionRecord;
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

    const outcome = await dispatchSyncJob(
      deps(new FakeReader([]), tokenSource, notifications, failingDiscovery),
      calendarListJob(connectionId, tenantId, principalId),
      now,
    );

    expect(outcome.result).toBe("drop");
    if (outcome.result === "drop") {
      expect(outcome.reason).toContain("notACalendarUser");
      expect(outcome.reason).toContain(connectionId);
    }
    const listResource = (
      await resources.listByConnection(
        tenantId as ProviderConnectionRecord["tenantId"],
        principalId as ProviderConnectionRecord["principalId"],
        connectionId as ProviderConnectionRecord["_id"],
      )
    ).find((resource) => resource.resourceKind === "calendarList");
    expect(listResource?.lastReadFailureAt).toEqual(now());
    expect(listResource?.lastReadFailureDetail).toContain("notACalendarUser");
  });

  it("rethrows a transient calendarList discovery failure for the worker retry ladder", async () => {
    const tenantId = objectId();
    const principalId = objectId();
    const connectionId = objectId();
    stubbedConnection = {
      _id: connectionId,
      tenantId,
      principalId,
      provider: "google",
    } as ProviderConnectionRecord;
    const transientDiscovery: ProviderCalendarAdapter = {
      discoverCalendars: async () => {
        throw new ProviderCalendarError(
          "transient",
          "Google rejected the calendar list read",
          { cause: new Error("HTTP 503") },
        );
      },
    };

    await expect(
      dispatchSyncJob(
        deps(
          new FakeReader([]),
          tokenSource,
          notifications,
          transientDiscovery,
        ),
        calendarListJob(connectionId, tenantId, principalId),
        now,
      ),
    ).rejects.toMatchObject({ reason: "transient" });
  });

  it("fails a resource job with providerNotConfigured without touching the resource", async () => {
    const calendar = await seedCalendar();
    const resource = await seedResource(calendar, null);
    const before = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    stubbedConnection = defaultGoogleConnection(
      resource.tenantId,
      resource.principalId,
      resource.connectionId,
    );
    stubbedConnection = {
      ...stubbedConnection,
      provider: "microsoft",
    };

    const reader = new FakeReader([]);
    const outcome = await dispatchSyncJob(
      {
        ...deps(reader),
        resolveAdapters: (provider) => {
          if (provider === "microsoft") {
            throw new ProviderNotConfiguredError("microsoft");
          }
          return fakeResolveAdapters(reader)(provider, stubbedConnection!);
        },
      },
      jobFor(resource, "initialImport"),
      now,
    );

    expect(outcome).toEqual({
      result: "fail",
      reason: "providerNotConfigured",
    });
    const after = await resources.findById(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    expect(after).toEqual(before);
  });
});
