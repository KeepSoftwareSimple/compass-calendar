import { faker } from "@faker-js/faker";
import { type DateTime, type TimeZone } from "@core/types/domain-primitives";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import {
  bindCommandRepos,
  COMMAND_NOW,
  FakeProviderEventWriter,
  newCommandIds,
  seedCommandCalendar,
  seedLinkedEvent,
  stubConnectionLookup,
  tokenSource,
} from "@sync/__tests__/helpers/command-scenario";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { executeProviderUpdate } from "@sync/domain/provider-command.update";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { type DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { beforeEach, describe, expect, it } from "bun:test";

const storage = setupSyncStorage(import.meta.url);
const repos = bindCommandRepos(storage);
const _objectId = () => faker.database.mongodbObjectId();
const now = COMMAND_NOW;

let _mongo: SyncMongoService;
let commands: CommandRepository;
let events: EventRepository;
let occurrences: EventOccurrenceRepository;
let resources: SyncResourceRepository;
let calendars: ProviderCalendarRepository;
let _markers: DeletionMarkerRepository;
let _credentials: CredentialRepository;

beforeEach(() => {
  _mongo = repos.mongo;
  commands = repos.commands;
  events = repos.events;
  occurrences = repos.occurrences;
  resources = repos.resources;
  calendars = repos.calendars;
  _markers = repos.markers;
  _credentials = repos.credentials;
});

describe("executeProviderUpdate on provider-managed events", () => {
  const schedule = {
    kind: "timed" as const,
    start: "2026-07-14T09:00:00-06:00" as DateTime,
    end: "2026-07-14T10:00:00-06:00" as DateTime,
    timeZone: "America/Denver" as TimeZone,
  };
  const content = (title: string, extras: Record<string, unknown> = {}) => ({
    title,
    description: "",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
    ...extras,
  });
  const providerEvent = (
    title: string,
    version: string,
    extras: Partial<ProviderEvent> = {},
  ): ProviderEvent => ({
    kind: "event",
    providerEventId: "g-evt-1" as ProviderEventId,
    providerVersion: version,
    providerUpdatedAt: null,
    content: content(title),
    schedule,
    busy: true,
    recurrence: { kind: "single" },
    providerManaged: true,
    ...extras,
  });

  const seedManaged = async (
    inputOverrides: {
      commandTitle?: string;
      commandSchedule?: typeof schedule;
      commandContent?: Record<string, unknown>;
      eventCustomizations?: EventRecord["customizations"];
    } = {},
  ) => {
    const ids = newCommandIds();
    const calendar = await seedCommandCalendar(calendars, ids);
    const event = await seedLinkedEvent(events, {
      ids,
      calendarId: calendar._id,
      content: content("Provider title"),
      schedule,
      recurrence: { kind: "single" },
      now: now(),
    });
    if (inputOverrides.eventCustomizations !== undefined) {
      await events.replaceExisting({
        ...event,
        customizations: inputOverrides.eventCustomizations,
      });
    }
    const commandTitle = inputOverrides.commandTitle ?? "Compass title";
    const { record: command } = await commands.submit({
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      idempotencyKey: ids.idempotencyKey,
      eventId: event._id,
      input: {
        kind: "update",
        invitation: "none",
        content: {
          ...content(commandTitle),
          ...inputOverrides.commandContent,
        },
        schedule: inputOverrides.commandSchedule ?? schedule,
        recurrence: { kind: "preserve" },
        scope: "all",
      } as unknown as SyncCommandInput,
      expectedVersion: "etag-1" as never,
    });
    const storedEvent = await events.findById(
      ids.tenantId,
      ids.principalId,
      event._id,
    );
    if (!storedEvent) throw new Error("seed failed");
    return {
      tenantId: ids.tenantId,
      principalId: ids.principalId,
      calendar,
      event: storedEvent,
      command,
    };
  };

  it("stores a title customization without calling patchEvent", async () => {
    const { tenantId, principalId, calendar, event, command } =
      await seedManaged();
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerEvent("Provider title", "etag-1");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(0);
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.title).toBe("Provider title");
    expect(stored?.customizations).toEqual({ title: "Compass title" });
  });

  it("patches color with providerManaged and confirms at the returned version", async () => {
    const { tenantId, principalId, calendar, event, command } =
      await seedManaged({
        commandContent: { color: "coral" },
      });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerEvent("Provider title", "etag-1");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(1);
    expect(writer.patchCalls[0]!.providerManaged).toBe(true);
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.content.color).toBe("coral");
    expect(stored?.providerVersion).toBe("etag-2" as ProviderEventVersion);
  });

  it("fails schedule edits as unsupportedCapability without patching", async () => {
    const movedSchedule = {
      ...schedule,
      start: "2026-07-14T10:00:00-06:00" as DateTime,
      end: "2026-07-14T11:00:00-06:00" as DateTime,
    };
    const { calendar, event, command } = await seedManaged({
      commandSchedule: movedSchedule,
    });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerEvent("Provider title", "etag-1");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("failed");
    expect(
      result.outcome.state === "failed" && result.outcome.failureReason,
    ).toBe("unsupportedCapability");
    expect(writer.patchCalls).toHaveLength(0);
  });

  it("clears customizations when the title matches the provider again", async () => {
    const { tenantId, principalId, calendar, event, command } =
      await seedManaged({
        commandTitle: "Provider title",
        eventCustomizations: { title: "Old overlay" },
      });
    const writer = new FakeProviderEventWriter();
    writer.fetched = providerEvent("Provider title", "etag-1");

    const result = await executeProviderUpdate(
      {
        commands,
        events,
        occurrences,
        resources,
        connections: stubConnectionLookup(),
        writer,
        custody: tokenSource(),
      },
      command,
      event,
      calendar,
      now,
    );

    expect(result.outcome.state).toBe("confirmed");
    expect(writer.patchCalls).toHaveLength(0);
    const stored = await events.findById(tenantId, principalId, event._id);
    expect(stored?.customizations).toBeNull();
  });
});
