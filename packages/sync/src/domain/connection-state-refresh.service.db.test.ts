import { faker } from "@faker-js/faker";
import { encryptCredentialAtRest } from "@core/security/credential-at-rest";
import {
  type PrincipalId,
  type ProviderAccountId,
  type ProviderCalendarId,
  type ProviderCalendarSourceId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { BOOTSTRAP_STALLED_AFTER_MS } from "@sync/domain/connection-state";
import { refreshConnectionState } from "@sync/domain/connection-state-refresh.service";
import { type JobEnqueue } from "@sync/storage/contracts/job.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { beforeEach, describe, expect, it } from "bun:test";
import { randomBytes } from "node:crypto";

const objectId = () => faker.database.mongodbObjectId();

describe("refreshConnectionState", () => {
  const storage = setupSyncStorage(import.meta.url);
  let connections: ProviderConnectionRepository;
  let calendars: ProviderCalendarRepository;
  let resources: SyncResourceRepository;
  let credentials: CredentialRepository;
  let jobs: JobRepository;

  beforeEach(() => {
    connections = new ProviderConnectionRepository(storage.db());
    calendars = new ProviderCalendarRepository(storage.db());
    resources = new SyncResourceRepository(storage.db());
    credentials = new CredentialRepository(storage.db());
    jobs = new JobRepository(storage.db());
  });

  const deps = () => ({ connections, calendars, resources, credentials, jobs });

  async function seedImportingConnection() {
    const connection = await connections.upsertByProviderAccount({
      tenantId: objectId() as TenantId,
      principalId: objectId() as PrincipalId,
      provider: "google",
      account: {
        providerAccountId: "acct-1" as ProviderAccountId,
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
    return connection;
  }

  it("stays importing until discovery finishes", async () => {
    const connection = await seedImportingConnection();
    await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "calendarList",
      calendarId: null,
    });

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("importing");
  });

  it("becomes healthy once discovery and active calendar imports finish", async () => {
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: "#fff",
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    const eventsResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "events-cursor",
      new Date("2026-07-11T00:00:00.000Z"),
    );
    await resources.setBootstrapState(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "ready",
    );

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("healthy");
    expect(after.stateReason).toBeNull();
    expect(after.lastHealthyAt).toBeInstanceOf(Date);
    expect(after.lastSyncedAt).toEqual(new Date("2026-07-11T00:00:00.000Z"));

    const slowerCalendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "shared@example.com" as ProviderCalendarSourceId,
      displayName: "Shared",
      color: null,
      active: true,
      primary: false,
      accessRole: "viewer",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: false,
        canReadBusy: true,
        canInviteAttendees: false,
      },
      eventLabels: [],
      createsGoogleMeet: true,
    });
    const slowerResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: slowerCalendar._id as ProviderCalendarId,
    });
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      slowerResource._id,
      "shared-cursor",
      new Date("2026-07-10T00:00:00.000Z"),
    );
    await resources.setBootstrapState(
      connection.tenantId,
      connection.principalId,
      slowerResource._id,
      "ready",
    );

    const withSlowerCalendar = await refreshConnectionState(deps(), after);
    expect(withSlowerCalendar.lastSyncedAt).toEqual(
      new Date("2026-07-10T00:00:00.000Z"),
    );
  });

  it("reports delayed/providerErrors when a failed bootstrap would otherwise keep syncing", async () => {
    // The 2026-07-30 gap: oldestDueWorkAt was hardcoded to null here, so a job
    // that exhausted its retry ladder and terminalized as state:"failed" was
    // invisible to the connection's own health state — every signal green
    // while a calendar sat unsynced for ~25h. A failed job is unconditionally
    // overdue (see findOldestOverdueByConnection), so this must flip the
    // connection to delayed the moment one exists, independent of any
    // otherwise-incomplete bootstrap evidence.
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: "#fff",
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    const eventsResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "events-cursor",
      new Date(),
    );
    await jobs.enqueue({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceId: eventsResource._id,
      commandId: null,
      kind: "bootstrapCatchup",
      priority: 0,
      runAfter: new Date("2026-01-01T00:00:00.000Z"),
      coalescingKey: `bootstrapCatchup:${eventsResource._id}`,
    } as JobEnqueue);
    const claimed = await jobs.claimDueJob(
      "worker",
      new Date("2026-01-01T00:00:00.000Z"),
      60_000,
    );
    await jobs.fail(claimed!._id, "worker");

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("delayed");
    expect(after.stateReason).toBe("providerErrors");
  });

  it("keeps importing when an active calendar still lacks a cursor", async () => {
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("importing");
  });

  it("keeps importing after a cursor until the post-watch catch-up is ready", async () => {
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    const eventsResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "events-cursor",
      new Date(),
    );

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("importing");
  });

  it("reports delayed/workOverdue once bootstrap has been incomplete past the overdue window, with no overdue job to point to", async () => {
    // The unwatchable-calendar loop (2026-08-04): a resource that is BOTH
    // unwatchable and has an expired sync cursor cycles cursorExpired -> repair
    // -> subscriptionMaintain -> unsupported -> repair forever, and EVERY job
    // in that cycle settles "done" - never overdue, never failed - so nothing
    // in the oldestDueWorkAt evidence ever fires. Without a time-bound
    // fallback, the connection reports "importing" with no bound, forever.
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    const eventsResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });
    // Still mid-bootstrap (never reaches "ready"), same as the live loop.
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "events-cursor",
      new Date(),
    );

    const stillFresh = await refreshConnectionState(deps(), connection);
    expect(stillFresh.state).toBe("importing");

    // Staleness is measured from the resource's updatedAt (the last
    // advanceCursor call above), not its createdAt - a resource whose chain
    // keeps advancing must never trip this just for having existed a while.
    const wellPastOverdue = () =>
      new Date(Date.now() + BOOTSTRAP_STALLED_AFTER_MS);
    const after = await refreshConnectionState(
      deps(),
      connection,
      wellPastOverdue,
    );
    expect(after.state).toBe("delayed");
    expect(after.stateReason).toBe("workOverdue");
  });

  it("reports delayed when an active calendar has no events resource and is past the stall window", async () => {
    const connection = await seedImportingConnection();
    await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );

    const stillFresh = await refreshConnectionState(deps(), connection);
    expect(stillFresh.state).toBe("importing");

    const wellPastOverdue = () =>
      new Date(Date.now() + BOOTSTRAP_STALLED_AFTER_MS);
    const after = await refreshConnectionState(
      deps(),
      connection,
      wellPastOverdue,
    );
    expect(after.state).toBe("delayed");
    expect(after.stateReason).toBe("workOverdue");
  });

  it("keeps importing when an active calendar has no events resource and is still young", async () => {
    const connection = await seedImportingConnection();
    await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("importing");
  });

  it("reports catchingUp while a user-requested pull is queued", async () => {
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    const eventsResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "events-cursor",
      new Date(),
    );
    await resources.setBootstrapState(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "ready",
    );
    await jobs.enqueue({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceId: eventsResource._id,
      commandId: null,
      kind: "incrementalPull",
      priority: 0,
      runAfter: new Date(),
      coalescingKey: `incrementalPull:${eventsResource._id}`,
    } as JobEnqueue);

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("catchingUp");
  });

  it("reports delayed/providerErrors when an active calendar's reads durably fail", async () => {
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "primary@example.com" as ProviderCalendarSourceId,
      displayName: "Primary",
      color: null,
      active: true,
      primary: true,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    const eventsResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });
    // Imported successfully, THEN the provider started durably rejecting reads —
    // the case that used to leave every health signal green.
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      "events-cursor",
      new Date(),
    );
    await resources.markReadFailure(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      new Date(),
      "Not Found (HTTP 404, reason notFound)",
    );

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("delayed");
    expect(after.stateReason).toBe("providerErrors");
  });

  it("reports delayed/providerErrors when calendarList discovery durably fails", async () => {
    const connection = await seedImportingConnection();
    const listResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "calendarList",
      calendarId: null,
    });
    // No active calendars and no events marker — connection-wide discovery
    // refusal used to leave the connection stuck on "importing" forever.
    await resources.markReadFailure(
      connection.tenantId,
      connection.principalId,
      listResource._id,
      new Date(),
      "The user must be signed up for Google Calendar. (HTTP 403, reason notACalendarUser)",
    );

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("delayed");
    expect(after.stateReason).toBe("providerErrors");
  });

  it("clears calendarList discovery failure once rediscovery succeeds", async () => {
    const connection = await seedImportingConnection();
    const listResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "calendarList",
      calendarId: null,
    });
    await resources.markReadFailure(
      connection.tenantId,
      connection.principalId,
      listResource._id,
      new Date(),
      "The user must be signed up for Google Calendar. (HTTP 403, reason notACalendarUser)",
    );
    // Successful rediscovery advances the cursor and clears the marker.
    await resources.advanceCursor(
      connection.tenantId,
      connection.principalId,
      listResource._id,
      "list-cursor",
      new Date(),
    );

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("healthy");
    expect(after.stateReason).toBeNull();
  });

  it("ignores a read-failure marker on a calendar that is no longer active", async () => {
    const connection = await seedImportingConnection();
    const calendar = await calendars.upsertByProviderCalendar({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      providerCalendarId: "retired@example.com" as ProviderCalendarSourceId,
      displayName: "Retired",
      color: null,
      active: false,
      primary: false,
      accessRole: "owner",
      capabilities: {
        canReadEvents: true,
        canWriteEvents: true,
        canReadBusy: true,
        canInviteAttendees: true,
      },
      eventLabels: [],
      createsGoogleMeet: true,
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
      new Date(),
    );
    const eventsResource = await resources.ensure({
      tenantId: connection.tenantId,
      principalId: connection.principalId,
      connectionId: connection._id,
      resourceKind: "events",
      calendarId: calendar._id as ProviderCalendarId,
    });
    await resources.markReadFailure(
      connection.tenantId,
      connection.principalId,
      eventsResource._id,
      new Date(),
      "Not Found (HTTP 404, reason notFound)",
    );

    // No active calendar is broken, so the connection is healthy.
    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("healthy");
  });

  it("derives actionRequired/authorizationRevoked when the credential is missing", async () => {
    const connection = await seedImportingConnection();
    await credentials.deleteByConnection(connection._id);

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("actionRequired");
    expect(after.stateReason).toBe("authorizationRevoked");
  });

  it("does not treat a password credential as revoked", async () => {
    const connection = await seedImportingConnection();
    await credentials.deleteByConnection(connection._id);
    const sealed = encryptCredentialAtRest(
      randomBytes(32).toString("base64"),
      "apple-app-password-fixture",
    );
    await credentials.storePassword({
      connectionId: connection._id,
      provider: "apple",
      username: "user@icloud.com",
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretTag: sealed.tag,
      keyVersion: sealed.keyVersion,
    });

    const after = await refreshConnectionState(deps(), connection);
    expect(after.stateReason).not.toBe("authorizationRevoked");
  });

  it("derives actionRequired/authorizationExpired after consecutive refresh failures", async () => {
    const connection = await seedImportingConnection();
    for (let i = 0; i < 3; i += 1) {
      await credentials.incrementRefreshFailure(connection._id);
    }

    const after = await refreshConnectionState(deps(), connection);
    expect(after.state).toBe("actionRequired");
    expect(after.stateReason).toBe("authorizationExpired");
  });
});
