import { faker } from "@faker-js/faker";
import {
  type CalendarId,
  type DateOnly,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { EventSchema } from "@core/types/event.contracts";
import {
  type SyncEventInstance,
  SyncEventInstanceSchema,
} from "@core/types/sync/event.contracts";
import { syncEventInstanceToBrowser } from "./event-list.translation";
import { composeOccurrenceId } from "./occurrence-id";
import { describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

const baseContent = {
  title: "Standup",
  description: "Daily",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
};

const baseInstance = (
  overrides: Partial<SyncEventInstance> = {},
): SyncEventInstance =>
  SyncEventInstanceSchema.parse({
    eventId: objectId() as EventId,
    calendarId: objectId() as CalendarId,
    content: baseContent,
    schedule: {
      kind: "timed",
      start: "2026-07-14T09:00:00.000Z" as DateTime,
      end: "2026-07-14T09:30:00.000Z" as DateTime,
      timeZone: "UTC" as TimeZone,
    },
    recurrence: { kind: "single" },
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides,
  });

describe("syncEventInstanceToBrowser", () => {
  it("maps a single to Event with recurrence.kind=single and the real eventId", () => {
    const instance = baseInstance();
    const event = syncEventInstanceToBrowser(instance);

    expect(() => EventSchema.parse(event)).not.toThrow();
    expect(event.id).toBe(instance.eventId);
    expect(event.recurrence).toEqual({ kind: "single" });
    expect(event.content).toEqual({
      kind: "details",
      title: "Standup",
      description: "Daily",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    });
    expect<unknown>(event.calendarId).toBe(instance.calendarId);
  });

  it("carries the cross-copy key through to the browser event", () => {
    const event = syncEventInstanceToBrowser(
      baseInstance({ icalUid: "shared@google.com" }),
    );

    expect(event.icalUid).toBe("shared@google.com");
  });

  it("leaves the cross-copy key absent when sync reported none", () => {
    // Absent must stay absent, not become an empty string: the grid reads a
    // missing key as "no correlation", and "" would match every other "".
    const event = syncEventInstanceToBrowser(baseInstance());

    expect("icalUid" in event).toBe(false);
  });

  it("carries providerManaged through to the browser event", () => {
    const event = syncEventInstanceToBrowser(
      baseInstance({ providerManaged: true }),
    );

    expect(event.providerManaged).toBe(true);
  });

  it("leaves providerManaged absent when sync reported none", () => {
    const event = syncEventInstanceToBrowser(baseInstance());

    expect("providerManaged" in event).toBe(false);
  });

  it("maps a series master row keeping the real eventId and rules", () => {
    const instance = baseInstance({
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const event = syncEventInstanceToBrowser(instance);

    expect(event.id).toBe(instance.eventId);
    expect(event.recurrence).toEqual({
      kind: "series",
      rules: ["RRULE:FREQ=WEEKLY"],
    });
  });

  it("composes an occurrence id and sets seriesId to the owning eventId", () => {
    const eventId = objectId() as EventId;
    const recurrenceId = "2026-07-14T09:00:00.000Z" as DateTime;
    const instance = baseInstance({
      eventId,
      recurrence: { kind: "occurrence", recurrenceId },
    });
    const event = syncEventInstanceToBrowser(instance);

    expect(event.id).toBe(
      composeOccurrenceId({ eventId, recurrenceId }) as EventId,
    );
    expect(event.recurrence).toEqual({ kind: "occurrence", seriesId: eventId });
  });

  it("passes schedule and timestamps through", () => {
    const instance = baseInstance({
      schedule: {
        kind: "allDay",
        start: "2026-07-14" as DateOnly,
        end: "2026-07-15" as DateOnly,
      },
      createdAt: "2026-06-01T12:00:00.000Z" as DateTime,
      updatedAt: "2026-06-02T12:00:00.000Z" as DateTime,
    });
    const event = syncEventInstanceToBrowser(instance);

    expect(event.schedule).toEqual(instance.schedule);
    expect(event.createdAt).toBe(instance.createdAt);
    expect(event.updatedAt).toBe(instance.updatedAt);
  });

  it("forwards content.color onto browser details content", () => {
    const instance = baseInstance({
      content: { ...baseContent, color: "blue" },
    });
    const event = syncEventInstanceToBrowser(instance);

    expect(event.content).toEqual({
      kind: "details",
      title: "Standup",
      description: "Daily",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      color: "blue",
    });
  });

  it("omits content.color on the browser event when sync has none", () => {
    const event = syncEventInstanceToBrowser(baseInstance());

    expect(event.content).not.toHaveProperty("color");
  });

  it("forwards content.colorHex onto browser details content", () => {
    const instance = baseInstance({
      content: { ...baseContent, colorHex: "#009688" },
    });
    const event = syncEventInstanceToBrowser(instance);

    expect(event.content).toEqual({
      kind: "details",
      title: "Standup",
      description: "Daily",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
      colorHex: "#009688",
    });
  });

  it("omits content.colorHex on the browser event when sync has none", () => {
    const event = syncEventInstanceToBrowser(baseInstance());

    expect(event.content).not.toHaveProperty("colorHex");
  });

  it("forwards location, organizer, attendees, and conference onto browser details content", () => {
    const instance = baseInstance({
      content: {
        title: "Sprint Planning",
        description: "Quarterly planning",
        location: "200 Main St, Anytown",
        organizer: { email: "lead@example.com", displayName: "Team Lead" },
        attendees: [
          {
            email: "lead@example.com",
            displayName: "Team Lead",
            responseStatus: "accepted",
          },
          {
            email: "guest@example.com",
            displayName: null,
            responseStatus: "tentative",
          },
        ],
        conference: {
          url: "https://meet.google.com/abc-defg-hij",
          label: "Google Meet",
        },
      },
    });
    const event = syncEventInstanceToBrowser(instance);

    expect(event.content).toEqual({
      kind: "details",
      title: "Sprint Planning",
      description: "Quarterly planning",
      location: "200 Main St, Anytown",
      organizer: { email: "lead@example.com", displayName: "Team Lead" },
      attendees: [
        {
          email: "lead@example.com",
          displayName: "Team Lead",
          responseStatus: "accepted",
        },
        {
          email: "guest@example.com",
          displayName: null,
          responseStatus: "tentative",
        },
      ],
      conference: {
        url: "https://meet.google.com/abc-defg-hij",
        label: "Google Meet",
      },
    });
  });
});
