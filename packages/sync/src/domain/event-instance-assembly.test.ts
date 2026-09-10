import { faker } from "@faker-js/faker";
import {
  type CalendarId,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  type EventRecord,
  EventRecordSchema,
} from "@sync/storage/contracts/event.contracts";
import {
  type EventOccurrenceRecord,
  EventOccurrenceRecordSchema,
} from "@sync/storage/contracts/event-occurrence.contracts";
import { assembleEventInstances } from "./event-instance-assembly";
import { describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

const timed = (start: string, end: string) => ({
  kind: "timed" as const,
  start: start as DateTime,
  end: end as DateTime,
  timeZone: "America/Denver" as TimeZone,
});

const baseContent = {
  title: "Standup",
  description: "Daily sync",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
};

const makeEvent = (overrides: Partial<EventRecord> = {}): EventRecord =>
  EventRecordSchema.parse({
    _id: objectId(),
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    origin: "compass",
    calendarId: objectId() as CalendarId,
    clientEventId: null,
    connectionId: null,
    providerEventId: null,
    providerVersion: null,
    providerUpdatedAt: null,
    deliveryState: null,
    providerMetadata: null,
    content: baseContent,
    schedule: timed("2026-07-14T09:00:00-06:00", "2026-07-14T09:15:00-06:00"),
    recurrence: { kind: "single" },
    lifecycleState: "active",
    generation: 0,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    confirmedAt: null,
    ...overrides,
  });

const makeOccurrence = (
  overrides: Partial<EventOccurrenceRecord> = {},
): EventOccurrenceRecord => {
  const startAt = overrides.startAt ?? new Date("2026-07-14T15:00:00.000Z");
  const eventId = overrides.eventId ?? (objectId() as EventId);
  return EventOccurrenceRecordSchema.parse({
    _id: objectId(),
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    eventId,
    occurrenceKey: `${eventId}:${startAt.toISOString()}`,
    calendarId: objectId() as CalendarId,
    schedule: timed("2026-07-14T09:00:00-06:00", "2026-07-14T09:15:00-06:00"),
    startAt,
    endAt: overrides.endAt ?? new Date(startAt.getTime() + 15 * 60_000),
    busy: true,
    title: "Standup",
    cancelled: false,
    generation: 0,
    ...overrides,
  });
};

const byId = (...events: EventRecord[]) =>
  new Map(events.map((event) => [event._id, event]));

describe("assembleEventInstances", () => {
  it("lifts the provider's cross-copy key out of the metadata bag", () => {
    const event = makeEvent({
      recurrence: { kind: "single" },
      providerMetadata: { iCalUID: "shared@google.com" },
    });

    const [instance] = assembleEventInstances(
      [makeOccurrence({ eventId: event._id })],
      byId(event),
    );

    expect(instance?.icalUid).toBe("shared@google.com");
  });

  it("omits the cross-copy key for an event imported without one", () => {
    // Events imported before the key was recorded must stay contract-valid.
    const event = makeEvent({
      recurrence: { kind: "single" },
      providerMetadata: null,
    });

    const [instance] = assembleEventInstances(
      [makeOccurrence({ eventId: event._id })],
      byId(event),
    );

    expect(instance && "icalUid" in instance).toBe(false);
  });

  it("ignores unrelated metadata when looking for the cross-copy key", () => {
    const event = makeEvent({
      recurrence: { kind: "single" },
      providerMetadata: { transparency: "transparent" },
    });

    const [instance] = assembleEventInstances(
      [makeOccurrence({ eventId: event._id })],
      byId(event),
    );

    expect(instance && "icalUid" in instance).toBe(false);
  });

  it("lifts providerManaged out of the metadata bag on every row shape", () => {
    const managedMetadata = { providerManaged: "true" as const };
    const singleEvent = makeEvent({
      recurrence: { kind: "single" },
      providerMetadata: managedMetadata,
    });
    const master = makeEvent({
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
      providerMetadata: managedMetadata,
    });
    const exception = makeEvent({
      recurrence: {
        kind: "exception",
        seriesId: master._id,
        recurrenceId: "2026-07-14T15:00:00.000Z" as DateTime,
        cancelled: false,
      },
      providerMetadata: managedMetadata,
    });
    const monday = makeOccurrence({
      eventId: master._id,
      startAt: new Date("2026-07-13T15:00:00.000Z"),
    });
    const movedOccurrence = makeOccurrence({
      eventId: exception._id,
      startAt: new Date("2026-07-14T18:00:00.000Z"),
    });

    const singleRow = assembleEventInstances(
      [makeOccurrence({ eventId: singleEvent._id })],
      byId(singleEvent),
    )[0];
    const seriesRows = assembleEventInstances(
      [monday, movedOccurrence],
      byId(master, exception),
    );

    expect(singleRow?.providerManaged).toBe(true);
    for (const row of seriesRows) {
      expect(row.providerManaged).toBe(true);
    }
  });

  it("omits providerManaged when the metadata bag has no such entry", () => {
    const event = makeEvent({
      recurrence: { kind: "single" },
      providerMetadata: null,
    });

    const [instance] = assembleEventInstances(
      [makeOccurrence({ eventId: event._id })],
      byId(event),
    );

    expect(instance && "providerManaged" in instance).toBe(false);
  });

  it("overlays customizations.title onto assembled instance content", () => {
    const event = makeEvent({
      content: { ...baseContent, title: "Provider title" },
      customizations: { title: "Compass title" },
    });
    const occurrence = makeOccurrence({ eventId: event._id });

    const [instance] = assembleEventInstances([occurrence], byId(event));

    expect(instance?.content.title).toBe("Compass title");
    expect(instance?.content.description).toBe(baseContent.description);
    expect(instance?.content.location).toBe(baseContent.location);
  });

  it("maps a single event to one single row carrying full content", () => {
    const event = makeEvent({ recurrence: { kind: "single" } });
    const occurrence = makeOccurrence({ eventId: event._id });

    const [instance, ...rest] = assembleEventInstances(
      [occurrence],
      byId(event),
    );

    expect(rest).toHaveLength(0);
    expect(instance?.eventId).toBe(event._id);
    expect(instance?.recurrence).toEqual({ kind: "single" });
    expect(instance?.content).toEqual(baseContent);
    // The instance schedule comes from the occurrence, timestamps from the event.
    expect(instance?.schedule).toEqual(occurrence.schedule);
    expect(instance?.createdAt).toBe("2026-07-01T00:00:00.000Z" as DateTime);
    expect(instance?.updatedAt).toBe("2026-07-02T00:00:00.000Z" as DateTime);
  });

  it("carries event content.color onto assembled instance content", () => {
    const event = makeEvent({
      content: { ...baseContent, color: "coral" },
    });
    const occurrence = makeOccurrence({ eventId: event._id });

    const [instance] = assembleEventInstances([occurrence], byId(event));

    expect(instance?.content).toEqual({ ...baseContent, color: "coral" });
  });

  it("carries event content.colorHex onto assembled instance content", () => {
    const event = makeEvent({
      content: { ...baseContent, colorHex: "#009688" },
    });
    const occurrence = makeOccurrence({ eventId: event._id });

    const [instance] = assembleEventInstances([occurrence], byId(event));

    expect(instance?.content).toEqual({ ...baseContent, colorHex: "#009688" });
  });

  it("omits a persisted null color instead of failing the whole page", () => {
    const event = makeEvent({
      content: { ...baseContent, color: null },
    });
    const occurrence = makeOccurrence({ eventId: event._id });

    const [instance] = assembleEventInstances([occurrence], byId(event));

    expect(instance?.content).toEqual(baseContent);
  });

  it("carries event content.location, organizer, attendees, and conference onto assembled instance content", () => {
    const event = makeEvent({
      content: {
        title: "Sprint Planning",
        description: "Quarterly planning",
        location: "200 Main St, Anytown",
        organizer: { email: "lead@example.com", displayName: "Team Lead" },
        attendees: [
          {
            email: "guest@example.com",
            displayName: "Guest",
            responseStatus: "accepted",
          },
        ],
        conference: {
          url: "https://meet.google.com/abc-defg-hij",
          label: "Google Meet",
        },
      },
    });
    const occurrence = makeOccurrence({ eventId: event._id });

    const [instance] = assembleEventInstances([occurrence], byId(event));

    expect(instance?.content).toEqual({
      title: "Sprint Planning",
      description: "Quarterly planning",
      location: "200 Main St, Anytown",
      organizer: { email: "lead@example.com", displayName: "Team Lead" },
      attendees: [
        {
          email: "guest@example.com",
          displayName: "Guest",
          responseStatus: "accepted",
        },
      ],
      conference: {
        url: "https://meet.google.com/abc-defg-hij",
        label: "Google Meet",
      },
    });
  });

  it("maps plain series instances to occurrence rows plus one master row", () => {
    const master = makeEvent({
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
    });
    const monday = makeOccurrence({
      eventId: master._id,
      startAt: new Date("2026-07-13T15:00:00.000Z"),
    });
    const tuesday = makeOccurrence({
      eventId: master._id,
      startAt: new Date("2026-07-14T15:00:00.000Z"),
    });

    const result = assembleEventInstances([monday, tuesday], byId(master));

    const occurrences = result.filter(
      (r) => r.recurrence.kind === "occurrence",
    );
    const masters = result.filter((r) => r.recurrence.kind === "series");
    expect(occurrences).toHaveLength(2);
    // Exactly one master row, back-filled even though there were two instances.
    expect(masters).toHaveLength(1);
    expect(masters[0]?.eventId).toBe(master._id);
    expect(masters[0]?.recurrence).toEqual({
      kind: "series",
      rules: ["RRULE:FREQ=DAILY"],
    });
    // Each occurrence is addressed by its own instant and owned by the master.
    expect(occurrences.every((o) => o.eventId === master._id)).toBe(true);
    expect(
      occurrences.map((o) =>
        o.recurrence.kind === "occurrence" ? o.recurrence.recurrenceId : null,
      ),
    ).toEqual([
      "2026-07-13T15:00:00.000Z" as DateTime,
      "2026-07-14T15:00:00.000Z" as DateTime,
    ]);
  });

  it("addresses an overridden instance by its ORIGINAL start, linked to the master", () => {
    const master = makeEvent({
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
    });
    // The user moved Tuesday's instance from 15:00 to 18:00. The exception is its
    // own event; its recurrenceId is the original 15:00 slot.
    const exception = makeEvent({
      content: {
        ...baseContent,
        title: "Standup (moved)",
        description: "rescheduled",
      },
      recurrence: {
        kind: "exception",
        seriesId: master._id,
        recurrenceId: "2026-07-14T15:00:00.000Z" as DateTime,
        cancelled: false,
      },
    });
    // The occurrence row for the override points at the exception, and its
    // startAt is the MOVED time — which must NOT become the recurrenceId.
    const movedOccurrence = makeOccurrence({
      eventId: exception._id,
      startAt: new Date("2026-07-14T18:00:00.000Z"),
      schedule: timed("2026-07-14T12:00:00-06:00", "2026-07-14T12:15:00-06:00"),
    });

    const result = assembleEventInstances(
      [movedOccurrence],
      byId(master, exception),
    );

    const override = result.find((r) => r.recurrence.kind === "occurrence");
    expect(override?.eventId).toBe(master._id);
    expect(
      override?.recurrence.kind === "occurrence"
        ? override.recurrence.recurrenceId
        : null,
    ).toBe("2026-07-14T15:00:00.000Z" as DateTime);
    // Content is the override's, schedule is the moved occurrence's.
    expect(override?.content.title).toBe("Standup (moved)");
    expect(override?.schedule).toEqual(movedOccurrence.schedule);
  });

  it("back-fills the master even when its only in-range row is an exception", () => {
    // Subtlety: the occurrence points at the exception, not the master. A back-
    // fill that only looked at seriesMaster events in the page would miss it.
    const master = makeEvent({
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const exception = makeEvent({
      recurrence: {
        kind: "exception",
        seriesId: master._id,
        recurrenceId: "2026-07-14T15:00:00.000Z" as DateTime,
        cancelled: false,
      },
    });
    const occurrence = makeOccurrence({ eventId: exception._id });

    const result = assembleEventInstances(
      [occurrence],
      byId(master, exception),
    );

    expect(result.filter((r) => r.recurrence.kind === "series")).toHaveLength(
      1,
    );
    expect(result.find((r) => r.recurrence.kind === "series")?.eventId).toBe(
      master._id,
    );
  });

  it("omits a cancelled occurrence entirely", () => {
    const master = makeEvent({
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
    });
    const cancelled = makeOccurrence({
      eventId: master._id,
      cancelled: true,
    });

    const result = assembleEventInstances([cancelled], byId(master));

    // No instance row for the deleted slot; no orphan master back-filled from it.
    expect(result).toEqual([]);
  });

  it("skips an occurrence whose owning event is missing, without throwing", () => {
    const orphan = makeOccurrence({ eventId: objectId() as EventId });

    expect(assembleEventInstances([orphan], byId())).toEqual([]);
  });

  it("de-duplicates the master row across many instances of one series", () => {
    const master = makeEvent({
      recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=DAILY"] },
    });
    const occurrences = Array.from({ length: 5 }, (_, i) =>
      makeOccurrence({
        eventId: master._id,
        startAt: new Date(`2026-07-1${i}T15:00:00.000Z`),
      }),
    );

    const result = assembleEventInstances(occurrences, byId(master));

    expect(result.filter((r) => r.recurrence.kind === "series")).toHaveLength(
      1,
    );
    expect(
      result.filter((r) => r.recurrence.kind === "occurrence"),
    ).toHaveLength(5);
  });
});
