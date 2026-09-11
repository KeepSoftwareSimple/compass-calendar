import { faker } from "@faker-js/faker";
import { type Document, type Filter } from "mongodb";
import {
  type CalendarId,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import {
  type IdempotencyKey,
  type PrincipalId,
  type ProviderEventId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  bindCommandRepos,
  COMMAND_NOW,
  cloudCommandDeps,
  FakeProviderEventWriter,
  fakeCredentialCustody,
  newCommandIds,
  seedCommandCalendar,
  stubConnectionLookup,
} from "@sync/__tests__/helpers/command-scenario";
import { fakeAdapters } from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  type CloudCommandDeps,
  ProviderWriteUnavailableError,
  submitCloudCommand,
} from "@sync/domain/cloud-command.service";
import { type ProviderConnectionLookup } from "@sync/domain/provider-command.service";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { type ProviderEventWriter } from "@sync/providers/provider-event-writer.port";
import { findSafetyCanaryHit } from "@sync/safety/safety-canary";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type CommandSubmit } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";

const storage = setupSyncStorage(import.meta.url);
const repos = bindCommandRepos(storage);
const objectId = () => faker.database.mongodbObjectId();
const now = COMMAND_NOW;

let mongo: SyncMongoService;
let commands: CommandRepository;
let events: EventRepository;
let occurrences: EventOccurrenceRepository;
let resources: SyncResourceRepository;
let calendars: ProviderCalendarRepository;
let markers: DeletionMarkerRepository;

beforeEach(() => {
  mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  resources = repos.resources;
  calendars = repos.calendars;
  markers = repos.markers;
});

const providerWriter = () => {
  const writer = new FakeProviderEventWriter();
  writer.matchFetchedById = false;
  writer.fetched = {
    kind: "event",
    providerEventId: "g-evt-1" as ProviderEventId,
    providerVersion: "etag-1",
    providerUpdatedAt: null,
    content: {
      title: "Provider copy",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule: {
      kind: "timed",
      start: "2026-07-14T09:00:00-06:00" as DateTime,
      end: "2026-07-14T10:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    },
    busy: true,
    recurrence: { kind: "single" },
  };
  writer.fetchedInstance = {
    kind: "event",
    providerEventId: "g-inst-1" as ProviderEventId,
    providerVersion: "etag-1",
    providerUpdatedAt: null,
    content: {
      title: "Provider copy",
      description: "",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule: {
      kind: "timed",
      start: "2026-07-21T09:00:00-06:00" as DateTime,
      end: "2026-07-21T10:00:00-06:00" as DateTime,
      timeZone: "America/Denver" as TimeZone,
    },
    busy: true,
    recurrence: { kind: "single" },
  };
  return writer;
};

const provider = (writer: ProviderEventWriter) => ({
  resolveAdapters: () =>
    fakeAdapters(
      {
        listEventPage: async () => {
          throw new Error("reader unused in cloud-command tests");
        },
      },
      { writer },
    ),
  custody: fakeCredentialCustody(),
});

describe("submitCloudCommand provider dispatch", () => {
  const connections: ProviderConnectionLookup = {
    findById: async () => ({
      account: { email: "user@example.com" },
      provider: "google",
    }),
  };

  const seedProviderCalendar = (tenantId: TenantId, principalId: PrincipalId) =>
    seedCommandCalendar(calendars, {
      ...newCommandIds(),
      tenantId,
      principalId,
    });

  const commandDeps = (
    writer?: FakeProviderEventWriter,
    extra: Partial<Pick<CloudCommandDeps, "execution" | "provider">> = {},
  ) =>
    cloudCommandDeps(
      { commands, events, calendars, occurrences, resources, markers },
      {
        connections,
        execution: "active",
        ...(writer ? { provider: provider(writer) } : {}),
        ...extra,
      },
    );

  const submitFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    calendarId: string,
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId: objectId() as EventId,
    input: {
      kind: "create",
      calendarId,
      invitation: "none",
      content: {
        title: "T",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00",
        end: "2026-07-14T10:00:00-06:00",
        timeZone: "America/Denver",
      },
      recurrence: { kind: "single" },
    } as unknown as SyncCommandInput,
    expectedVersion: null,
  });

  it("executes a provider-targeted create when active and provider-capable", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      submitFor(tenantId, principalId, calendar._id),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.calls).toHaveLength(1);
  });

  // Accepting these would strand the write: nothing re-dispatches a pending
  // command, so the caller would see success for an event that never reaches
  // the provider. Production hit exactly that on 2026-07-29.
  it("refuses a provider-targeted create when passive", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const writer = providerWriter();

    const submit = submitCloudCommand(
      commandDeps(writer, { execution: "passive" }),
      submitFor(tenantId, principalId, calendar._id),
      now,
    );

    await expect(submit).rejects.toThrow(ProviderWriteUnavailableError);
    expect(writer.calls).toHaveLength(0);
  });

  it("refuses a provider-targeted create when no provider is configured", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);

    const submit = submitCloudCommand(
      commandDeps(undefined, { provider: undefined }),
      submitFor(tenantId, principalId, calendar._id),
      now,
    );

    await expect(submit).rejects.toThrow(ProviderWriteUnavailableError);
  });

  it("still confirms a cloud (non-provider) create locally when active", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      // A calendar id with no provider_calendars row is a Compass cloud calendar.
      submitFor(tenantId, principalId, objectId()),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.calls).toHaveLength(0);
  });

  // A "move" command has no executor anywhere yet - accepting it and leaving
  // it pending would strand the write forever while the caller sees success
  // (submitCommandOrThrow only rejects failed/cancelled outcomes). It must
  // fail explicitly instead.
  it("fails a move command as unsupportedCapability rather than leaving it pending", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const submit: CommandSubmit = {
      tenantId,
      principalId,
      idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
      eventId: objectId() as EventId,
      input: {
        kind: "move",
        calendarId: objectId(),
      } as unknown as SyncCommandInput,
      expectedVersion: null,
    };

    const { command } = await submitCloudCommand(
      commandDeps(undefined, { provider: undefined }),
      submit,
      now,
    );

    expect(command.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
  });

  it("omits null color when persisting a cloud create", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const submit = submitFor(tenantId, principalId, objectId());
    if (submit.input.kind !== "create") throw new Error("expected create");
    submit.input = {
      ...submit.input,
      content: { ...submit.input.content, color: null },
    };

    const { command } = await submitCloudCommand(
      commandDeps(undefined, { provider: undefined }),
      submit,
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    const stored = await events.findById(
      tenantId,
      principalId,
      command.eventId,
    );
    expect(stored?.content).not.toHaveProperty("color");
  });

  // Seed an existing event to mutate. Overrides let a test make it
  // provider-linked or recurring to exercise the deferral guards.
  const seedEvent = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    overrides: Partial<EventRecord> = {},
  ) =>
    events.put({
      _id: eventId,
      tenantId,
      principalId,
      origin: "compass",
      calendarId: objectId() as CalendarId,
      clientEventId: null,
      connectionId: null,
      providerEventId: null,
      providerVersion: null,
      providerUpdatedAt: null,
      deliveryState: null,
      providerMetadata: null,
      content: {
        title: "Existing",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00" as DateTime,
        end: "2026-07-14T10:00:00-06:00" as DateTime,
        timeZone: "America/Denver" as TimeZone,
      },
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: 0,
      createdAt: now(),
      updatedAt: now(),
      confirmedAt: now(),
      ...overrides,
    } as EventRecord);

  const deleteFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    scope = "all",
    recurrenceId: string | null = null,
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId,
    input: { kind: "delete", scope, recurrenceId } as SyncCommandInput,
    expectedVersion: null,
  });

  const deps = () =>
    cloudCommandDeps(
      { commands, events, calendars, occurrences, resources, markers },
      { connections, execution: "passive" },
    );

  it("refuses a delete of a provider-linked event when passive, rather than stranding it pending", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      connectionId: objectId() as never,
      providerEventId: "g-evt-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
    });

    const submit = submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, eventId),
      now,
    );

    await expect(submit).rejects.toThrow(ProviderWriteUnavailableError);
    // The event is untouched — never delete a provider event without the
    // provider's confirmation.
    expect(
      await events.findById(tenantId, principalId, eventId),
    ).not.toBeNull();
  });

  it("routes a provider-linked update to the provider executor when active", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-evt-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      {
        tenantId,
        principalId,
        idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
        eventId,
        input: {
          kind: "update",
          invitation: "none",
          content: {
            title: "Renamed",
            description: "",
            location: null,
            organizer: null,
            attendees: [],
            conference: null,
          },
          schedule: {
            kind: "timed",
            start: "2026-07-14T09:00:00-06:00",
            end: "2026-07-14T10:00:00-06:00",
            timeZone: "America/Denver",
          },
          recurrence: { kind: "preserve" },
          scope: "all",
        } as unknown as SyncCommandInput,
        expectedVersion: "etag-1" as never,
      },
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
  });

  it("routes a provider-linked delete to the provider executor when active", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-evt-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      deleteFor(tenantId, principalId, eventId),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.deleteCalls).toHaveLength(1);
    // Local content removed only after the provider confirmed.
    expect(await events.findById(tenantId, principalId, eventId)).toBeNull();
    expect(
      await markers.exists(
        calendar.connectionId,
        calendar._id,
        "g-evt-1" as never,
      ),
    ).toBe(true);
  });

  it("deletes a provider-linked series at the provider on an all-scope delete", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      deleteFor(tenantId, principalId, eventId, "all"),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.deleteCalls).toHaveLength(1);
    expect(await events.findById(tenantId, principalId, eventId)).toBeNull();
  });

  it("resolves and deletes one occurrence of a provider-linked series (this scope)", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      deleteFor(
        tenantId,
        principalId,
        eventId,
        "this",
        "2026-07-21T09:00:00-06:00",
      ),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    // Deletes the RESOLVED INSTANCE at the provider — the series master and
    // every other occurrence are untouched.
    expect(writer.deleteCalls).toHaveLength(1);
    expect(
      await events.findById(tenantId, principalId, eventId),
    ).not.toBeNull();
    const exceptions = await events.findSeriesExceptions(
      tenantId,
      principalId,
      eventId,
    );
    expect(exceptions).toHaveLength(1);
    expect(
      exceptions[0]?.recurrence.kind === "exception" &&
        exceptions[0]?.recurrence.cancelled,
    ).toBe(true);
  });

  // --- rsvp routing (WP-07) --------------------------------------------------

  const rsvpFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    scope = "all",
    recurrenceId: string | null = null,
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId,
    input: {
      kind: "rsvp",
      responseStatus: "declined",
      scope,
      recurrenceId,
    } as unknown as SyncCommandInput,
    expectedVersion: null,
  });

  const selfConnection = {
    findById: async () => ({
      account: { email: "self@example.com" },
      provider: "google" as const,
    }),
  };

  it("routes a provider-linked rsvp to the provider executor when active", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-evt-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
      content: {
        title: "Existing",
        description: "",
        location: null,
        organizer: { email: "organizer@example.com", displayName: null },
        attendees: [
          {
            email: "self@example.com",
            displayName: null,
            responseStatus: "accepted",
          },
        ],
        conference: null,
      },
    });
    const writer = providerWriter();
    writer.fetched = {
      ...(writer.fetched as ProviderEvent),
      content: {
        ...(writer.fetched as ProviderEvent).content,
        attendees: [
          {
            email: "self@example.com",
            displayName: null,
            responseStatus: "accepted",
          },
        ],
      },
    };

    const { command } = await submitCloudCommand(
      {
        commands,
        events,
        calendars,
        occurrences,
        resources,
        connections: selfConnection,
        markers,
        execution: "active",
        provider: provider(writer),
      },
      rsvpFor(tenantId, principalId, eventId),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.attendees).toEqual([
      {
        email: "self@example.com",
        displayName: null,
        responseStatus: "declined",
      },
    ]);
    const stored = await events.findById(tenantId, principalId, eventId);
    expect(stored?.content.attendees).toEqual([
      {
        email: "self@example.com",
        displayName: null,
        responseStatus: "declined",
      },
    ]);
  });

  it("fails an rsvp against a cloud-only event typed, with no provider call", async () => {
    // Cloud-only events with attendees are not expected in v1 — there is no
    // provider invitation to answer and Compass sends no email — so the
    // command fails typed (unsupportedCapability) instead of being stranded
    // pending or guessed at locally.
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      content: {
        title: "Existing",
        description: "",
        location: null,
        organizer: null,
        attendees: [
          {
            email: "self@example.com",
            displayName: null,
            responseStatus: "needsAction",
          },
        ],
        conference: null,
      },
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      {
        commands,
        events,
        calendars,
        occurrences,
        resources,
        connections: selfConnection,
        markers,
        execution: "active",
        provider: provider(writer),
      },
      rsvpFor(tenantId, principalId, eventId),
      now,
    );

    expect(command.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    expect(writer.patchCalls).toHaveLength(0);
    // No attendee JSON on the failure surface the route logs from.
    expect(findSafetyCanaryHit(command.outcome)).toBeNull();
  });

  it("fails an rsvp with scope thisAndFollowing typed", async () => {
    // An RSVP answers "this event" or "all events"; from-here-on has no v1
    // semantics and the browser cannot send it.
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      {
        commands,
        events,
        calendars,
        occurrences,
        resources,
        connections: selfConnection,
        markers,
        execution: "active",
        provider: provider(writer),
      },
      rsvpFor(
        tenantId,
        principalId,
        eventId,
        "thisAndFollowing",
        "2026-07-21T15:00:00.000Z",
      ),
      now,
    );

    expect(command.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("fails an rsvp against a missing event as a version conflict", async () => {
    // The target vanished since the browser last saw it — an honest
    // conflict, mirroring the update path.
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      {
        commands,
        events,
        calendars,
        occurrences,
        resources,
        connections: selfConnection,
        markers,
        execution: "active",
        provider: provider(writer),
      },
      rsvpFor(tenantId, principalId, objectId() as EventId),
      now,
    );

    expect(command.outcome).toEqual({
      state: "failed",
      failureReason: "versionConflict",
    });
    expect(writer.patchCalls).toHaveLength(0);
  });

  const updateSeriesFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    scope: string,
    recurrenceId: string | null = null,
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId,
    input: {
      kind: "update",
      invitation: "none",
      content: {
        title: "Renamed series",
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00",
        end: "2026-07-14T10:00:00-06:00",
        timeZone: "America/Denver",
      },
      recurrence: { kind: "preserve" },
      scope,
      recurrenceId,
    } as unknown as SyncCommandInput,
    expectedVersion: "etag-1" as never,
  });

  it("routes a provider-linked series all-scope update to the provider executor", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      updateSeriesFor(tenantId, principalId, eventId, "all"),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
  });

  it("refuses an all-scope update of a provider-linked series when passive, rather than stranding it pending", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      connectionId: objectId() as never,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });

    const submit = submitCloudCommand(
      deps(),
      updateSeriesFor(tenantId, principalId, eventId, "all"),
      now,
    );

    await expect(submit).rejects.toThrow(ProviderWriteUnavailableError);
    expect(
      await events.findById(tenantId, principalId, eventId),
    ).not.toBeNull();
  });

  it("resolves and patches one occurrence of a provider-linked series (this scope)", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendar = await seedProviderCalendar(tenantId, principalId);
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId, {
      calendarId: calendar._id,
      connectionId: calendar.connectionId as never,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const writer = providerWriter();

    const { command } = await submitCloudCommand(
      commandDeps(writer),
      updateSeriesFor(
        tenantId,
        principalId,
        eventId,
        "this",
        "2026-07-21T09:00:00-06:00",
      ),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    // Patched the RESOLVED INSTANCE's own id, never the master's.
    expect(writer.patchCalls[0]?.providerEventId).toBe("g-inst-1");
    const exceptions = await events.findSeriesExceptions(
      tenantId,
      principalId,
      eventId,
    );
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.content.title).toBe("Renamed series");
    expect(
      await events.findById(tenantId, principalId, eventId),
    ).not.toBeNull();
  });

  // The occurrence projection is the read model, so a cloud command must leave
  // it consistent with the event it just wrote.
  const occurrenceStartsFor = async (eventId: EventId): Promise<string[]> => {
    const docs = await mongo.db
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ eventId })
      .sort({ startAt: 1 })
      .toArray();
    return docs.map((doc) => (doc["startAt"] as Date).toISOString());
  };

  it("projects the occurrence for a cloud single create", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const submit = submitFor(tenantId, principalId, objectId());

    const { command } = await submitCloudCommand(deps(), submit, now);

    expect(command.outcome.state).toBe("confirmed");
    expect(await occurrenceStartsFor(submit.eventId)).toEqual([
      "2026-07-14T15:00:00.000Z",
    ]);
  });

  it("projects every occurrence for a cloud series create", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const submit = submitFor(tenantId, principalId, objectId());
    (submit.input as { recurrence: unknown }).recurrence = {
      kind: "series",
      rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
    };

    await submitCloudCommand(deps(), submit, now);

    expect(await occurrenceStartsFor(submit.eventId)).toEqual([
      "2026-07-14T15:00:00.000Z",
      "2026-07-21T15:00:00.000Z",
      "2026-07-28T15:00:00.000Z",
    ]);
  });

  it("reprojects occurrences when a cloud event is updated", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    await seedEvent(tenantId, principalId, eventId);

    const update: CommandSubmit = {
      tenantId,
      principalId,
      idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
      eventId,
      input: {
        kind: "update",
        invitation: "none",
        content: {
          title: "Moved",
          description: "",
          location: null,
          organizer: null,
          attendees: [],
          conference: null,
        },
        schedule: {
          kind: "timed",
          start: "2026-07-15T11:00:00-06:00",
          end: "2026-07-15T12:00:00-06:00",
          timeZone: "America/Denver",
        },
        recurrence: { kind: "preserve" },
        scope: "this",
      } as unknown as SyncCommandInput,
      expectedVersion: null,
    };

    const { command } = await submitCloudCommand(deps(), update, now);

    expect(command.outcome.state).toBe("confirmed");
    expect(await occurrenceStartsFor(eventId)).toEqual([
      "2026-07-15T17:00:00.000Z",
    ]);
  });

  it("clears occurrences when a cloud event is deleted", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const submit = submitFor(tenantId, principalId, objectId());
    await submitCloudCommand(deps(), submit, now);
    expect(await occurrenceStartsFor(submit.eventId)).toHaveLength(1);

    const { command } = await submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, submit.eventId),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(await occurrenceStartsFor(submit.eventId)).toHaveLength(0);
  });

  it("clears occurrences before deleting the event so a crash cannot orphan them", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const submit = submitFor(tenantId, principalId, objectId());
    await submitCloudCommand(deps(), submit, now);

    // If the delete landed before the clear, a crash in between would leave the
    // event gone but its occurrences orphaned — and the retry's `!existing`
    // branch confirms without ever clearing them. Lock in the clear-first order.
    const order: string[] = [];
    const realClear = occurrences.replaceForEvent.bind(occurrences);
    const realDelete = events.deleteById.bind(events);
    spyOn(occurrences, "replaceForEvent").mockImplementation(
      async (...args) => {
        order.push("clear");
        return realClear(...args);
      },
    );
    spyOn(events, "deleteById").mockImplementation(async (...args) => {
      order.push("delete");
      return realDelete(...args);
    });

    await submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, submit.eventId),
      now,
    );

    expect(order).toEqual(["clear", "delete"]);
  });

  const seriesMaster = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    overrides: Partial<EventRecord> = {},
  ) =>
    seedEvent(tenantId, principalId, eventId, {
      recurrence: {
        kind: "seriesMaster",
        rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
      },
      ...overrides,
    });

  const seriesException = (
    tenantId: TenantId,
    principalId: PrincipalId,
    seriesId: EventId,
    recurrenceId: string,
    cancelled = false,
  ) =>
    seedEvent(tenantId, principalId, objectId() as EventId, {
      recurrence: {
        kind: "exception",
        seriesId,
        recurrenceId: recurrenceId as never,
        cancelled,
      },
      schedule: {
        kind: "timed",
        start: recurrenceId,
        // A valid end on the same day as the instance (09:00 starts -> 23:00).
        end: recurrenceId.replace(/T\d{2}:/, "T23:"),
        timeZone: "America/Denver",
      } as never,
    });

  const updateAllFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    title: string,
    recurrence: unknown = { kind: "preserve" },
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId,
    input: {
      kind: "update",
      invitation: "none",
      content: {
        title,
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-14T09:00:00-06:00",
        end: "2026-07-14T10:00:00-06:00",
        timeZone: "America/Denver",
      },
      recurrence,
      scope: "all",
    } as unknown as SyncCommandInput,
    expectedVersion: null,
  });

  it("deletes a whole cloud series and clears all its occurrences (scope all)", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const excepted = "2026-07-21T09:00:00-06:00";
    const master = await seriesMaster(tenantId, principalId, masterId);
    const exception = await seriesException(
      tenantId,
      principalId,
      masterId,
      excepted,
    );
    await reprojectOccurrences(occurrences, master, now, [excepted as never]);
    await reprojectOccurrences(occurrences, exception, now);
    expect((await occurrenceStartsFor(masterId)).length).toBeGreaterThan(0);
    expect(await occurrenceStartsFor(exception._id)).toHaveLength(1);

    const { command } = await submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, masterId),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(await events.findById(tenantId, principalId, masterId)).toBeNull();
    expect(
      await events.findById(tenantId, principalId, exception._id),
    ).toBeNull();
    expect(await occurrenceStartsFor(masterId)).toHaveLength(0);
    expect(await occurrenceStartsFor(exception._id)).toHaveLength(0);
  });

  it("edits a whole cloud series, drops its exceptions, and reprojects (scope all)", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const excepted = "2026-07-21T09:00:00-06:00";
    const master = await seriesMaster(tenantId, principalId, masterId);
    const exception = await seriesException(
      tenantId,
      principalId,
      masterId,
      excepted,
    );
    await reprojectOccurrences(occurrences, master, now, [excepted as never]);
    await reprojectOccurrences(occurrences, exception, now);

    const { command } = await submitCloudCommand(
      deps(),
      updateAllFor(tenantId, principalId, masterId, "Renamed"),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    const updated = await events.findById(tenantId, principalId, masterId);
    expect(updated?.content.title).toBe("Renamed");
    // The exception is discarded and the master now owns every instant again.
    expect(
      await events.findById(tenantId, principalId, exception._id),
    ).toBeNull();
    expect(await occurrenceStartsFor(exception._id)).toHaveLength(0);
    const starts = await occurrenceStartsFor(masterId);
    expect(starts).toContain("2026-07-21T15:00:00.000Z");
    expect(starts).toHaveLength(3);
  });

  it("preserves a cancelled occurrence across an edit-all (no resurrection)", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const cancelledInstant = "2026-07-21T09:00:00-06:00";
    const master = await seriesMaster(tenantId, principalId, masterId);
    // The user deleted this one occurrence (scope "this" tombstone).
    const tombstone = await seriesException(
      tenantId,
      principalId,
      masterId,
      cancelledInstant,
      true,
    );
    await reprojectOccurrences(occurrences, master, now, [
      cancelledInstant as never,
    ]);
    await reprojectOccurrences(occurrences, tombstone, now);

    const { command } = await submitCloudCommand(
      deps(),
      updateAllFor(tenantId, principalId, masterId, "Renamed"),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    // The tombstone survives, so the deleted instant is still not a live
    // occurrence of the master.
    expect(
      await events.findById(tenantId, principalId, tombstone._id),
    ).not.toBeNull();
    const starts = await occurrenceStartsFor(masterId);
    expect(starts).not.toContain("2026-07-21T15:00:00.000Z");
    expect(starts).toHaveLength(2);
  });

  it("converts a series to a single event on edit-all and still drops exceptions", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const excepted = "2026-07-21T09:00:00-06:00";
    const master = await seriesMaster(tenantId, principalId, masterId);
    const exception = await seriesException(
      tenantId,
      principalId,
      masterId,
      excepted,
    );
    await reprojectOccurrences(occurrences, master, now, [excepted as never]);
    await reprojectOccurrences(occurrences, exception, now);

    const { command } = await submitCloudCommand(
      deps(),
      updateAllFor(tenantId, principalId, masterId, "Now single", {
        kind: "single",
      }),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    const updated = await events.findById(tenantId, principalId, masterId);
    expect(updated?.recurrence.kind).toBe("single");
    // The exceptions are gone even though the master is no longer a series.
    expect(
      await events.findById(tenantId, principalId, exception._id),
    ).toBeNull();
    expect(await occurrenceStartsFor(exception._id)).toHaveLength(0);
    // A single event projects exactly one occurrence.
    expect(await occurrenceStartsFor(masterId)).toHaveLength(1);
  });

  it("refuses an all-scope delete of a provider-linked series when passive, rather than stranding it pending", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    await seriesMaster(tenantId, principalId, masterId, {
      connectionId: objectId() as never,
      providerEventId: "g-series-1" as never,
      providerVersion: "etag-1" as never,
      deliveryState: "confirmed",
    });

    const submit = submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, masterId),
      now,
    );

    await expect(submit).rejects.toThrow(ProviderWriteUnavailableError);
    expect(
      await events.findById(tenantId, principalId, masterId),
    ).not.toBeNull();
  });

  const updateThisFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    recurrenceId: string,
    title: string,
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId,
    input: {
      kind: "update",
      invitation: "none",
      content: {
        title,
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-21T11:00:00-06:00",
        end: "2026-07-21T12:00:00-06:00",
        timeZone: "America/Denver",
      },
      recurrence: { kind: "preserve" },
      scope: "this",
      recurrenceId,
    } as unknown as SyncCommandInput,
    expectedVersion: null,
  });

  const EXCEPTED = "2026-07-21T09:00:00-06:00";
  const EXCEPTED_START = "2026-07-21T15:00:00.000Z";

  it("cancels one occurrence of a cloud series with scope this", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const master = await seriesMaster(tenantId, principalId, masterId);
    await reprojectOccurrences(occurrences, master, now);
    expect(await occurrenceStartsFor(masterId)).toHaveLength(3);

    const { command } = await submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, masterId, "this", EXCEPTED),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    const starts = await occurrenceStartsFor(masterId);
    expect(starts).not.toContain(EXCEPTED_START);
    expect(starts).toHaveLength(2);
    const exceptions = await events.findSeriesExceptions(
      tenantId,
      principalId,
      masterId,
    );
    expect(exceptions).toHaveLength(1);
    const only = exceptions[0];
    expect(
      only?.recurrence.kind === "exception" && only.recurrence.cancelled,
    ).toBe(true);
  });

  it("overrides one occurrence of a cloud series with scope this", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const master = await seriesMaster(tenantId, principalId, masterId);
    await reprojectOccurrences(occurrences, master, now);

    const { command } = await submitCloudCommand(
      deps(),
      updateThisFor(tenantId, principalId, masterId, EXCEPTED, "Moved"),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    const exceptions = await events.findSeriesExceptions(
      tenantId,
      principalId,
      masterId,
    );
    expect(exceptions).toHaveLength(1);
    const only = exceptions[0];
    expect(only?.content.title).toBe("Moved");
    expect(
      only?.recurrence.kind === "exception" && !only.recurrence.cancelled,
    ).toBe(true);
    // The master no longer owns the instant; the override occurrence does.
    const masterStarts = await occurrenceStartsFor(masterId);
    expect(masterStarts).not.toContain(EXCEPTED_START);
    expect(masterStarts).toHaveLength(2);
    if (only) {
      expect(await occurrenceStartsFor(only._id)).toHaveLength(1);
    }
  });

  it("upserts a single exception across two deletes of the same occurrence", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const master = await seriesMaster(tenantId, principalId, masterId);
    await reprojectOccurrences(occurrences, master, now);

    // Two distinct commands (fresh idempotency keys) targeting one instant.
    await submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, masterId, "this", EXCEPTED),
      now,
    );
    await submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, masterId, "this", EXCEPTED),
      now,
    );

    const exceptions = await events.findSeriesExceptions(
      tenantId,
      principalId,
      masterId,
    );
    expect(exceptions).toHaveLength(1);
  });

  it("deletes this and following occurrences of a cloud series", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    // Weekly x3 from 2026-07-14: 07-14, 07-21, 07-28 (all 09:00-06 = 15:00Z).
    const master = await seriesMaster(tenantId, principalId, masterId);
    // An override on the last occurrence — it is at/after the split, so it goes.
    const following = await seriesException(
      tenantId,
      principalId,
      masterId,
      "2026-07-28T09:00:00-06:00",
    );
    await reprojectOccurrences(occurrences, master, now, [
      "2026-07-28T09:00:00-06:00" as never,
    ]);
    await reprojectOccurrences(occurrences, following, now);

    const { command } = await submitCloudCommand(
      deps(),
      deleteFor(tenantId, principalId, masterId, "thisAndFollowing", EXCEPTED),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    // Only the occurrence before the split survives.
    expect(await occurrenceStartsFor(masterId)).toEqual([
      "2026-07-14T15:00:00.000Z",
    ]);
    // The following exception is gone.
    expect(
      await events.findById(tenantId, principalId, following._id),
    ).toBeNull();
  });

  const splitFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    recurrenceId: string,
    title: string,
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId,
    input: {
      kind: "update",
      invitation: "none",
      content: {
        title,
        description: "",
        location: null,
        organizer: null,
        attendees: [],
        conference: null,
      },
      schedule: {
        kind: "timed",
        start: "2026-07-21T09:00:00-06:00",
        end: "2026-07-21T10:00:00-06:00",
        timeZone: "America/Denver",
      },
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY;COUNT=2"] },
      scope: "thisAndFollowing",
      recurrenceId,
    } as unknown as SyncCommandInput,
    expectedVersion: null,
  });

  const otherSeriesMaster = (principalId: PrincipalId, masterId: EventId) =>
    mongo.db
      .collection(SYNC_COLLECTIONS.events)
      .find({
        principalId,
        "recurrence.kind": "seriesMaster",
        _id: { $ne: masterId },
      } as unknown as Filter<Document>)
      .toArray();

  it("splits a cloud series into a truncated original and an edited remainder", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const master = await seriesMaster(tenantId, principalId, masterId);
    // An override after the split — superseded by the new series, so dropped.
    const following = await seriesException(
      tenantId,
      principalId,
      masterId,
      "2026-07-28T09:00:00-06:00",
    );
    await reprojectOccurrences(occurrences, master, now, [
      "2026-07-28T09:00:00-06:00" as never,
    ]);
    await reprojectOccurrences(occurrences, following, now);

    const { command } = await submitCloudCommand(
      deps(),
      splitFor(tenantId, principalId, masterId, EXCEPTED, "Split"),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    // The original keeps only the pre-split occurrence, with its old title.
    const original = await events.findById(tenantId, principalId, masterId);
    expect(original?.content.title).toBe("Existing");
    expect(await occurrenceStartsFor(masterId)).toEqual([
      "2026-07-14T15:00:00.000Z",
    ]);
    // The following exception is gone.
    expect(
      await events.findById(tenantId, principalId, following._id),
    ).toBeNull();
    // A remainder series carries the edit from the split point on.
    const remainders = await otherSeriesMaster(principalId, masterId);
    expect(remainders).toHaveLength(1);
    const remainder = remainders[0];
    expect(remainder?.["content"]).toMatchObject({ title: "Split" });
    expect(
      await occurrenceStartsFor(String(remainder?.["_id"]) as EventId),
    ).toEqual(["2026-07-21T15:00:00.000Z", "2026-07-28T15:00:00.000Z"]);
  });

  it("upserts a single remainder master across two splits at the same point", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const master = await seriesMaster(tenantId, principalId, masterId);
    await reprojectOccurrences(occurrences, master, now);

    // Two distinct commands (fresh idempotency keys) splitting at one point.
    await submitCloudCommand(
      deps(),
      splitFor(tenantId, principalId, masterId, EXCEPTED, "First"),
      now,
    );
    await submitCloudCommand(
      deps(),
      splitFor(tenantId, principalId, masterId, EXCEPTED, "Second"),
      now,
    );

    // The deterministic remainder id means one remainder, not two.
    expect(await otherSeriesMaster(principalId, masterId)).toHaveLength(1);
  });

  it("collapses a thisAndFollowing edit at the first occurrence to editing the whole series", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const master = await seriesMaster(tenantId, principalId, masterId);
    await reprojectOccurrences(occurrences, master, now);

    const { command } = await submitCloudCommand(
      deps(),
      splitFor(
        tenantId,
        principalId,
        masterId,
        "2026-07-14T09:00:00-06:00",
        "Whole",
      ),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    // Edited in place — no separate remainder series was created.
    const original = await events.findById(tenantId, principalId, masterId);
    expect(original?.content.title).toBe("Whole");
    expect(await otherSeriesMaster(principalId, masterId)).toHaveLength(0);
  });

  it("collapses thisAndFollowing at the first occurrence to deleting the whole series", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const masterId = objectId() as EventId;
    const master = await seriesMaster(tenantId, principalId, masterId);
    await reprojectOccurrences(occurrences, master, now);

    const { command } = await submitCloudCommand(
      deps(),
      // The split point is the series' own first occurrence.
      deleteFor(
        tenantId,
        principalId,
        masterId,
        "thisAndFollowing",
        "2026-07-14T09:00:00-06:00",
      ),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    expect(await events.findById(tenantId, principalId, masterId)).toBeNull();
    expect(await occurrenceStartsFor(masterId)).toHaveLength(0);
  });

  // Regression coverage for the prod incident: deleting an event, undoing the
  // delete (which recreates the event under its ORIGINAL id — see the "A25"
  // doc comment in useUndoRedo.ts), then deleting again reuses the exact same
  // idempotency key as the first delete (hashedIdempotencyKey is identity-only
  // — eventId/scope/recurrenceId, see event-command.translation.ts). Without
  // the liveness guard, the second delete replays the first CONFIRMED command
  // and the event becomes permanently undeletable: 204 to the caller, no
  // provider call, no local removal, and no TTL on `commands` to ever clear
  // it. These pin submitCloudCommand's terminalReplayIsStale guard, which
  // reopens a terminal command back to pending and re-executes it whenever the
  // world no longer matches what it once confirmed.
  describe("terminal replay liveness", () => {
    it("re-deletes a cloud single event recreated under the same id after an earlier confirmed delete", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const eventId = objectId() as EventId;
      await seedEvent(tenantId, principalId, eventId);
      const submit = deleteFor(tenantId, principalId, eventId);

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");
      expect(await events.findById(tenantId, principalId, eventId)).toBeNull();

      // The A25 undo: recreate the SAME event id, later than the delete.
      await seedEvent(tenantId, principalId, eventId, {
        createdAt: new Date(now().getTime() + 1000),
        updatedAt: new Date(now().getTime() + 1000),
      });

      // The exact same submit (same idempotencyKey) as the first delete.
      const second = await submitCloudCommand(deps(), submit, now);

      expect(second.changed).toBe(true);
      expect(second.command.outcome.state).toBe("confirmed");
      expect(await events.findById(tenantId, principalId, eventId)).toBeNull();
      // Reopen updates the SAME row rather than minting a second command.
      expect(
        await mongo.db
          .collection(SYNC_COLLECTIONS.commands)
          .countDocuments({ idempotencyKey: submit.idempotencyKey }),
      ).toBe(1);
    });

    it("calls the provider a second time when a provider-linked event is recreated under the same id and deleted again", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const calendar = await seedProviderCalendar(tenantId, principalId);
      const eventId = objectId() as EventId;
      await seedEvent(tenantId, principalId, eventId, {
        calendarId: calendar._id,
        connectionId: calendar.connectionId as never,
        providerEventId: "g-evt-1" as never,
        providerVersion: "etag-1" as never,
        deliveryState: "confirmed",
      });
      const writer = providerWriter();
      const activeDeps = commandDeps(writer);
      const submit = deleteFor(tenantId, principalId, eventId);

      const first = await submitCloudCommand(activeDeps, submit, now);
      expect(first.command.outcome.state).toBe("confirmed");
      expect(writer.deleteCalls).toHaveLength(1);

      // Recreated under the same id (the undo path re-links it to the provider
      // too, but a fresh provider-linked seed exercises the same collision).
      await seedEvent(tenantId, principalId, eventId, {
        calendarId: calendar._id,
        connectionId: calendar.connectionId as never,
        providerEventId: "g-evt-2" as never,
        providerVersion: "etag-2" as never,
        deliveryState: "confirmed",
        createdAt: new Date(now().getTime() + 1000),
        updatedAt: new Date(now().getTime() + 1000),
      });

      const second = await submitCloudCommand(activeDeps, submit, now);

      expect(second.command.outcome.state).toBe("confirmed");
      expect(writer.deleteCalls).toHaveLength(2);
      expect(await events.findById(tenantId, principalId, eventId)).toBeNull();
    });

    it("still short-circuits a genuine retry: resubmitting a confirmed delete of an event that stays gone makes no provider call", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const calendar = await seedProviderCalendar(tenantId, principalId);
      const eventId = objectId() as EventId;
      await seedEvent(tenantId, principalId, eventId, {
        calendarId: calendar._id,
        connectionId: calendar.connectionId as never,
        providerEventId: "g-evt-1" as never,
        providerVersion: "etag-1" as never,
        deliveryState: "confirmed",
      });
      const writer = providerWriter();
      const activeDeps = commandDeps(writer);
      const submit = deleteFor(tenantId, principalId, eventId);

      await submitCloudCommand(activeDeps, submit, now);
      expect(writer.deleteCalls).toHaveLength(1);

      const second = await submitCloudCommand(activeDeps, submit, now);

      expect(second.changed).toBe(false);
      expect(writer.deleteCalls).toHaveLength(1);
      expect(
        await mongo.db
          .collection(SYNC_COLLECTIONS.commands)
          .countDocuments({ idempotencyKey: submit.idempotencyKey }),
      ).toBe(1);
    });

    it("re-cancels a recurring occurrence whose tombstone was un-cancelled since the confirmed delete (scope this)", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const masterId = objectId() as EventId;
      const master = await seriesMaster(tenantId, principalId, masterId);
      await reprojectOccurrences(occurrences, master, now);
      const submit = deleteFor(
        tenantId,
        principalId,
        masterId,
        "this",
        EXCEPTED,
      );

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");

      // Undo un-cancels the tombstone in place (replaySnapshot in
      // useUndoRedo.ts), leaving the master's own createdAt untouched.
      await events.upsertException(
        master,
        EXCEPTED as never,
        {
          content: master.content,
          schedule: {
            kind: "timed",
            start: EXCEPTED,
            end: EXCEPTED.replace(/T\d{2}:/, "T23:"),
            timeZone: "America/Denver",
          } as never,
          cancelled: false,
        },
        new Date(now().getTime() + 1000),
      );

      const second = await submitCloudCommand(deps(), submit, now);

      expect(second.changed).toBe(true);
      expect(second.command.outcome.state).toBe("confirmed");
      expect(await occurrenceStartsFor(masterId)).not.toContain(
        "2026-07-21T15:00:00.000Z",
      );
    });

    it("re-truncates a series whose thisAndFollowing split was undone since the confirmed delete", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const masterId = objectId() as EventId;
      const master = await seriesMaster(tenantId, principalId, masterId);
      await reprojectOccurrences(occurrences, master, now);
      const submit = deleteFor(
        tenantId,
        principalId,
        masterId,
        "thisAndFollowing",
        EXCEPTED,
      );

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");
      const truncated = await events.findById(tenantId, principalId, masterId);
      if (!truncated) throw new Error("expected the truncated master");

      // Undo restores the original, untruncated rules.
      await events.replaceExisting({
        ...truncated,
        recurrence: master.recurrence,
        updatedAt: new Date(now().getTime() + 1000),
      });

      const second = await submitCloudCommand(deps(), submit, now);

      expect(second.changed).toBe(true);
      expect(second.command.outcome.state).toBe("confirmed");
      expect(await occurrenceStartsFor(masterId)).toEqual([
        "2026-07-14T15:00:00.000Z",
      ]);
    });

    // Deliberately NOT guarded, unlike delete — see the docblock above
    // terminalReplayIsStale in command-replay.ts. Unlike a delete's key, a
    // create's key (`create:${eventId}`) is stable for that event id's whole
    // lifetime, so a later, UNRELATED resubmit of the same create payload
    // (e.g. an offline promotion retry — see
    // local-event-sync.util.ts's syncLocalEventsToCloud) collides with it
    // too, not only an A25 undo. Nothing in the command history can tell
    // those two apart, so guarding here would risk silently resurrecting an
    // event the user deliberately deleted afterward. Pin the no-op replay so
    // a future change doesn't "fix" this the same way delete was fixed.
    it("still short-circuits a confirmed create replay for an event since deleted (no guard for create — resurrection risk)", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const submit = submitFor(tenantId, principalId, objectId());

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");

      await events.deleteById(tenantId, principalId, submit.eventId);

      const second = await submitCloudCommand(deps(), submit, now);

      expect(second.changed).toBe(false);
      expect(
        await events.findById(tenantId, principalId, submit.eventId),
      ).toBeNull();
    });

    // restore:true is the explicit client intent (undo-of-delete) that flips
    // the above no-op into a genuine reopen — see terminalReplayIsStale's
    // docblock in command-replay.ts. Only set by useUndoRedo's replays, never
    // by an offline-promotion retry, so the resurrection risk above doesn't
    // apply here.
    it("reopens a restore-flagged create replay and re-executes it with the client's refreshed content", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const submit = submitFor(tenantId, principalId, objectId());

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");

      await events.deleteById(tenantId, principalId, submit.eventId);

      const restoreSubmit: CommandSubmit = {
        ...submit,
        restore: true,
        input: {
          kind: "create",
          calendarId: (submit.input as { calendarId: string }).calendarId,
          invitation: "none",
          content: {
            title: "Edited before delete",
            description: "",
            location: null,
            organizer: null,
            attendees: [],
            conference: null,
          },
          schedule: (submit.input as { schedule: unknown }).schedule,
          recurrence: { kind: "single" },
        } as unknown as SyncCommandInput,
      };
      const second = await submitCloudCommand(deps(), restoreSubmit, now);

      expect(second.changed).toBe(true);
      expect(second.command.outcome.state).toBe("confirmed");
      const restored = await events.findById(
        tenantId,
        principalId,
        submit.eventId,
      );
      expect(restored?.content).toMatchObject({
        title: "Edited before delete",
      });
      // Reopen updates the SAME row rather than minting a second command.
      expect(
        await mongo.db
          .collection(SYNC_COLLECTIONS.commands)
          .countDocuments({ idempotencyKey: submit.idempotencyKey }),
      ).toBe(1);
    });

    it("treats a restore-flagged create replay as a no-op when the event is still active", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const submit = submitFor(tenantId, principalId, objectId());

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");

      // No delete in between - a double-undo or a retry after the restore
      // already landed.
      const second = await submitCloudCommand(
        deps(),
        { ...submit, restore: true },
        now,
      );

      expect(second.changed).toBe(false);
    });

    it("never reopens an explicitly cancelled create even when restore is set", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const submit = submitFor(tenantId, principalId, objectId());
      const { record: pending } = await commands.submit(submit);
      await commands.updateOutcome(
        tenantId,
        principalId,
        pending._id,
        { state: "cancelled" },
        pending.attemptCount,
      );

      const result = await submitCloudCommand(
        deps(),
        { ...submit, restore: true },
        now,
      );

      expect(result.changed).toBe(false);
      expect(result.command.outcome.state).toBe("cancelled");
    });

    it("reopens a restore-flagged update replay even though its content is identical to the original", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const eventId = objectId() as EventId;
      await seedEvent(tenantId, principalId, eventId);
      const submit = updateAllFor(
        tenantId,
        principalId,
        eventId,
        "Replayed title",
      );

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");

      // Without restore, this exact resubmission is the existing no-op
      // (pinned above). With it (redo-of-edit / undo replaying the same
      // snapshot again), it must actually re-apply.
      const second = await submitCloudCommand(
        deps(),
        { ...submit, restore: true },
        now,
      );

      expect(second.changed).toBe(true);
      expect(second.command.outcome.state).toBe("confirmed");
    });

    it("does not re-litigate an explicitly cancelled command", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const eventId = objectId() as EventId;
      const submit = deleteFor(tenantId, principalId, eventId);
      const { record: pending } = await commands.submit(submit);
      await commands.updateOutcome(
        tenantId,
        principalId,
        pending._id,
        { state: "cancelled" },
        pending.attemptCount,
      );
      await seedEvent(tenantId, principalId, eventId);

      const result = await submitCloudCommand(deps(), submit, now);

      expect(result.changed).toBe(false);
      expect(result.command.outcome.state).toBe("cancelled");
      expect(
        await events.findById(tenantId, principalId, eventId),
      ).not.toBeNull();
    });

    it("still short-circuits an identical update replay against a re-created event (no guard for update/move)", async () => {
      const tenantId = objectId() as TenantId;
      const principalId = objectId() as PrincipalId;
      const eventId = objectId() as EventId;
      await seedEvent(tenantId, principalId, eventId);
      const submit = updateAllFor(
        tenantId,
        principalId,
        eventId,
        "First title",
      );

      const first = await submitCloudCommand(deps(), submit, now);
      expect(first.command.outcome.state).toBe("confirmed");

      await events.deleteById(tenantId, principalId, eventId);
      await seedEvent(tenantId, principalId, eventId, {
        content: {
          title: "Re-created title",
          description: "",
          location: null,
          organizer: null,
          attendees: [],
          conference: null,
        } as never,
        createdAt: new Date(now().getTime() + 1000),
        updatedAt: new Date(now().getTime() + 1000),
      });

      const second = await submitCloudCommand(deps(), submit, now);

      expect(second.changed).toBe(false);
      const stored = await events.findById(tenantId, principalId, eventId);
      // The re-created event's own (seeded) title survives — the stale
      // update command was NOT reapplied on top of it.
      expect(stored?.content).not.toMatchObject({ title: "First title" });
    });
  });
});

// WP-02: attendeesEdit "replace" on cloud-only records — stored membership
// merges against the stored list (no provider copy exists), creates normalize
// every guest to needsAction, and per-occurrence/split replaces are refused
// typed. "preserve"/legacy stays byte-identical (covered by every pre-existing
// test in this file, none of which set attendeesEdit).
describe("cloud-only attendeesEdit replace", () => {
  const deps = () =>
    cloudCommandDeps(
      { commands, events, calendars, occurrences, resources, markers },
      { connections: stubConnectionLookup(), execution: "active" },
    );

  const attendee = (
    email: string,
    responseStatus = "needsAction",
    displayName: string | null = null,
  ) => ({ email, displayName, responseStatus });

  const contentWith = (title: string, attendees: unknown[] = []) => ({
    title,
    description: "",
    location: null,
    organizer: null,
    attendees,
    conference: null,
  });

  const schedule = {
    kind: "timed",
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };

  const seedCloudEvent = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    overrides: Partial<EventRecord> = {},
  ) =>
    events.put({
      _id: eventId,
      tenantId,
      principalId,
      origin: "compass",
      calendarId: objectId() as CalendarId,
      clientEventId: null,
      connectionId: null,
      providerEventId: null,
      providerVersion: null,
      providerUpdatedAt: null,
      deliveryState: null,
      providerMetadata: null,
      content: contentWith("Existing", [
        attendee("kept@example.com", "accepted", "Kept"),
        attendee("dropped@example.com", "tentative"),
      ]),
      schedule,
      recurrence: { kind: "single" },
      lifecycleState: "active",
      generation: 0,
      createdAt: now(),
      updatedAt: now(),
      confirmedAt: now(),
      ...overrides,
    } as EventRecord);

  const updateFor = (
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    opts: {
      attendees: unknown[];
      scope?: string;
      recurrenceId?: string | null;
    },
  ): CommandSubmit => ({
    tenantId,
    principalId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
    eventId,
    input: {
      kind: "update",
      invitation: "none",
      attendeesEdit: "replace",
      content: contentWith("Existing", opts.attendees),
      schedule,
      recurrence: { kind: "preserve" },
      scope: opts.scope ?? "all",
      recurrenceId: opts.recurrenceId ?? null,
    } as unknown as SyncCommandInput,
    expectedVersion: null,
  });

  it("stores the merged membership on a cloud-only update", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    await seedCloudEvent(tenantId, principalId, eventId);

    const { command } = await submitCloudCommand(
      deps(),
      updateFor(tenantId, principalId, eventId, {
        attendees: [
          attendee("kept@example.com"),
          attendee("new@example.com", "needsAction", "New"),
        ],
      }),
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    const stored = await events.findById(tenantId, principalId, eventId);
    // Retained guests keep their stored status/name, new guests enter as
    // needsAction, dropped guests are removed.
    expect(stored?.content.attendees).toEqual([
      attendee("kept@example.com", "accepted", "Kept"),
      attendee("new@example.com", "needsAction", "New"),
    ] as never);
  });

  it("normalizes every guest to needsAction on a cloud-only create", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;

    const { command } = await submitCloudCommand(
      deps(),
      {
        tenantId,
        principalId,
        idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
        eventId,
        input: {
          kind: "create",
          calendarId: objectId(),
          invitation: "none",
          attendeesEdit: "replace",
          content: contentWith("Kickoff", [
            attendee("a@example.com", "accepted", "Aye"),
            attendee("b@example.com"),
          ]),
          schedule,
          recurrence: { kind: "single" },
        } as unknown as SyncCommandInput,
        expectedVersion: null,
      },
      now,
    );

    expect(command.outcome.state).toBe("confirmed");
    const stored = await events.findById(tenantId, principalId, eventId);
    expect(stored?.content.attendees).toEqual([
      attendee("a@example.com", "needsAction", "Aye"),
      attendee("b@example.com", "needsAction"),
    ] as never);
  });

  it("refuses a replace on a cloud occurrence edit (this scope), with a content-free failure", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    await seedCloudEvent(tenantId, principalId, eventId, {
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });

    const { command } = await submitCloudCommand(
      deps(),
      updateFor(tenantId, principalId, eventId, {
        attendees: [attendee("a@example.com")],
        scope: "this",
        recurrenceId: "2026-07-21T15:00:00.000Z",
      }),
      now,
    );

    expect(command.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    // No exception override was created for the refused edit.
    expect(
      await events.findSeriesExceptions(tenantId, principalId, eventId),
    ).toHaveLength(0);
    // The failure surface (what the command route logs and the SSE notices
    // derive from) carries no attendee JSON or event content.
    expect(findSafetyCanaryHit(command.outcome)).toBeNull();
  });

  it("refuses a replace on a cloud thisAndFollowing split", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    await seedCloudEvent(tenantId, principalId, eventId, {
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });

    const { command } = await submitCloudCommand(
      deps(),
      updateFor(tenantId, principalId, eventId, {
        attendees: [attendee("a@example.com")],
        scope: "thisAndFollowing",
        recurrenceId: "2026-07-21T15:00:00.000Z",
      }),
      now,
    );

    expect(command.outcome).toEqual({
      state: "failed",
      failureReason: "unsupportedCapability",
    });
    // The master's rules were not truncated by the refused split.
    const stored = await events.findById(tenantId, principalId, eventId);
    expect(stored?.recurrence).toEqual({
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=WEEKLY"],
    } as never);
  });
});
