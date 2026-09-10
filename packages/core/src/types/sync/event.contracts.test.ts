import { faker } from "@faker-js/faker";
import {
  AttendeeSchema,
  ConferenceSchema,
  OrganizerSchema,
} from "@core/types/event-attendance.contracts";
import {
  EventInstanceListQuerySchema,
  EventInstanceListResponseSchema,
  SyncEventCalendarIdSchema,
  SyncEventInstanceSchema,
  SyncEventOwnershipSchema,
  SyncEventRecurrenceSchema,
  SyncEventSchema,
  SyncInstanceRecurrenceSchema,
} from "@core/types/sync/event.contracts";

const objectId = () => faker.database.mongodbObjectId();

const timedSchedule = {
  kind: "timed",
  start: "2026-07-14T09:00:00-06:00",
  end: "2026-07-14T10:00:00-06:00",
  timeZone: "America/Denver",
};

// 2026-03-08 is the US spring-forward transition; 09:00-10:00 local crosses
// it in wall-clock time while the UTC offset itself changes.
const dstCrossingSchedule = {
  kind: "timed",
  start: "2026-03-08T01:30:00-07:00",
  end: "2026-03-08T03:30:00-06:00",
  timeZone: "America/Denver",
} as const;

const allDaySchedule = {
  kind: "allDay",
  start: "2026-07-14",
  end: "2026-07-15",
};

const unlinkedOwnership = { kind: "unlinked" };

const linkedOwnership = () => ({
  kind: "linked",
  connectionId: objectId(),
  calendarId: objectId(),
  providerEventId: "abc123@google.com",
  providerVersion: "etag-1",
  providerUpdatedAt: "2026-07-20T12:00:00.000Z",
  deliveryState: "confirmed",
});

const baseContent = {
  title: "Standup",
  description: "Daily sync",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
};

const baseEvent = (overrides: Record<string, unknown> = {}) => ({
  id: objectId(),
  clientEventId: null,
  origin: "compass",
  ownership: unlinkedOwnership,
  content: baseContent,
  schedule: timedSchedule,
  recurrence: { kind: "single" },
  lifecycleState: "active",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
  confirmedAt: null,
  ...overrides,
});

describe("Sync event contracts", () => {
  describe("SyncEventSchema", () => {
    it("accepts a timed, unlinked, single event", () => {
      expect(SyncEventSchema.safeParse(baseEvent()).success).toBe(true);
    });

    it("accepts an all-day event", () => {
      const event = baseEvent({ schedule: allDaySchedule });
      expect(SyncEventSchema.safeParse(event).success).toBe(true);
    });

    it("round-trips a DST-crossing timed schedule unchanged", () => {
      const event = baseEvent({ schedule: dstCrossingSchedule });
      const parsed = SyncEventSchema.parse(event);
      expect(
        SyncEventSchema.parse(JSON.parse(JSON.stringify(parsed))).schedule,
      ).toEqual(dstCrossingSchedule);
    });

    it("accepts a linked event with full ownership evidence", () => {
      const event = baseEvent({
        origin: "provider",
        ownership: linkedOwnership(),
      });
      expect(SyncEventSchema.safeParse(event).success).toBe(true);
    });

    it("accepts a linked event carrying opaque provider metadata", () => {
      const event = baseEvent({
        ownership: {
          ...linkedOwnership(),
          providerMetadata: { iCalUID: "abc@google.com", sequence: "3" },
        },
      });
      expect(SyncEventSchema.safeParse(event).success).toBe(true);
    });

    it("rejects a linked event missing providerVersion", () => {
      const { providerVersion: _dropped, ...incomplete } = linkedOwnership();
      const event = baseEvent({ ownership: incomplete });
      expect(SyncEventSchema.safeParse(event).success).toBe(false);
    });

    it("accepts a deletionPending event", () => {
      const event = baseEvent({ lifecycleState: "deletionPending" });
      expect(SyncEventSchema.safeParse(event).success).toBe(true);
    });

    it("accepts a non-null confirmedAt once the provider has confirmed", () => {
      const event = baseEvent({ confirmedAt: "2026-07-20T12:00:00.000Z" });
      expect(SyncEventSchema.safeParse(event).success).toBe(true);
    });

    it("rejects a raw provider payload field", () => {
      const event = baseEvent({ googleEventId: "leak" });
      expect(SyncEventSchema.safeParse(event).success).toBe(false);
    });

    it("rejects an unknown lifecycle state", () => {
      const event = baseEvent({ lifecycleState: "deleted" });
      expect(SyncEventSchema.safeParse(event).success).toBe(false);
    });
  });

  describe("SyncEventOwnershipSchema", () => {
    it("accepts unlinked", () => {
      expect(
        SyncEventOwnershipSchema.safeParse(unlinkedOwnership).success,
      ).toBe(true);
    });

    it("accepts linked with full evidence", () => {
      expect(
        SyncEventOwnershipSchema.safeParse(linkedOwnership()).success,
      ).toBe(true);
    });

    it("accepts a null providerUpdatedAt before the provider has reported one", () => {
      const ownership = { ...linkedOwnership(), providerUpdatedAt: null };
      expect(SyncEventOwnershipSchema.safeParse(ownership).success).toBe(true);
    });

    it("rejects an unrecognized kind", () => {
      expect(
        SyncEventOwnershipSchema.safeParse({ kind: "mirrored" }).success,
      ).toBe(false);
    });
  });

  describe("SyncEventRecurrenceSchema", () => {
    it("accepts single", () => {
      expect(
        SyncEventRecurrenceSchema.safeParse({ kind: "single" }).success,
      ).toBe(true);
    });

    it("accepts a series master with rules", () => {
      const recurrence = { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY"] };
      expect(SyncEventRecurrenceSchema.safeParse(recurrence).success).toBe(
        true,
      );
    });

    it("rejects a series master with empty rules", () => {
      const recurrence = { kind: "seriesMaster", rules: [] };
      expect(SyncEventRecurrenceSchema.safeParse(recurrence).success).toBe(
        false,
      );
    });

    it("accepts a cancelled exception overriding one occurrence", () => {
      const recurrence = {
        kind: "exception",
        seriesId: objectId(),
        recurrenceId: "2026-07-21T09:00:00.000Z",
        cancelled: true,
      };
      expect(SyncEventRecurrenceSchema.safeParse(recurrence).success).toBe(
        true,
      );
    });

    it("accepts a non-cancelled override exception", () => {
      const recurrence = {
        kind: "exception",
        seriesId: objectId(),
        recurrenceId: "2026-07-21T09:00:00.000Z",
        cancelled: false,
      };
      expect(SyncEventRecurrenceSchema.safeParse(recurrence).success).toBe(
        true,
      );
    });

    it("rejects an exception missing seriesId", () => {
      const recurrence = {
        kind: "exception",
        recurrenceId: "2026-07-21T09:00:00.000Z",
        cancelled: false,
      };
      expect(SyncEventRecurrenceSchema.safeParse(recurrence).success).toBe(
        false,
      );
    });
  });

  describe("OrganizerSchema and AttendeeSchema", () => {
    it("accepts an organizer with a display name", () => {
      const organizer = {
        email: "founder@compasscalendar.com",
        displayName: "Tyler",
      };
      expect(OrganizerSchema.safeParse(organizer).success).toBe(true);
    });

    it("accepts an organizer with a null display name", () => {
      const organizer = {
        email: "founder@compasscalendar.com",
        displayName: null,
      };
      expect(OrganizerSchema.safeParse(organizer).success).toBe(true);
    });

    it.each([
      "needsAction",
      "accepted",
      "declined",
      "tentative",
    ] as const)("accepts attendee response status %s", (responseStatus) => {
      const attendee = {
        email: "guest@example.com",
        displayName: null,
        responseStatus,
      };
      expect(AttendeeSchema.safeParse(attendee).success).toBe(true);
    });

    it("rejects an unknown response status", () => {
      const attendee = {
        email: "guest@example.com",
        displayName: null,
        responseStatus: "maybe",
      };
      expect(AttendeeSchema.safeParse(attendee).success).toBe(false);
    });
  });

  describe("ConferenceSchema", () => {
    it("accepts a conference URL with a label", () => {
      const conference = {
        url: "https://meet.google.com/abc-defg-hij",
        label: "Google Meet",
      };
      expect(ConferenceSchema.safeParse(conference).success).toBe(true);
    });

    it("rejects a non-URL value", () => {
      const conference = { url: "not-a-url", label: null };
      expect(ConferenceSchema.safeParse(conference).success).toBe(false);
    });
  });

  describe("SyncEventCalendarIdSchema", () => {
    // A calendar id must be groupable whether its source event is still
    // unlinked (Compass's own calendar id) or provider-linked (the provider
    // calendar id) — Sync is the store of record for both.
    it("accepts a Compass calendar id for an unlinked event", () => {
      expect(SyncEventCalendarIdSchema.safeParse(objectId()).success).toBe(
        true,
      );
    });
  });

  describe("SyncInstanceRecurrenceSchema", () => {
    it("accepts a single row", () => {
      expect(
        SyncInstanceRecurrenceSchema.safeParse({ kind: "single" }).success,
      ).toBe(true);
    });

    it("accepts a series master row carrying the rule", () => {
      const recurrence = { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] };
      expect(SyncInstanceRecurrenceSchema.safeParse(recurrence).success).toBe(
        true,
      );
    });

    it("rejects a series master row with empty rules", () => {
      const recurrence = { kind: "series", rules: [] };
      expect(SyncInstanceRecurrenceSchema.safeParse(recurrence).success).toBe(
        false,
      );
    });

    it("accepts an occurrence row addressed by its recurrenceId", () => {
      const recurrence = {
        kind: "occurrence",
        recurrenceId: "2026-07-21T09:00:00.000Z",
      };
      expect(SyncInstanceRecurrenceSchema.safeParse(recurrence).success).toBe(
        true,
      );
    });

    it("rejects an occurrence row missing its recurrenceId", () => {
      const recurrence = { kind: "occurrence" };
      expect(SyncInstanceRecurrenceSchema.safeParse(recurrence).success).toBe(
        false,
      );
    });
  });

  describe("SyncEventInstanceSchema", () => {
    const baseInstanceContent = {
      title: "Standup",
      description: "Daily sync",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    };

    const baseInstance = (overrides: Record<string, unknown> = {}) => ({
      eventId: objectId(),
      calendarId: objectId(),
      content: baseInstanceContent,
      schedule: timedSchedule,
      recurrence: { kind: "single" },
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      ...overrides,
    });

    it("accepts a single timed instance", () => {
      expect(SyncEventInstanceSchema.safeParse(baseInstance()).success).toBe(
        true,
      );
    });

    it("accepts a series master row with a rule", () => {
      const instance = baseInstance({
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
      });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(true);
    });

    it("accepts a projected occurrence row addressed by recurrenceId", () => {
      const instance = baseInstance({
        recurrence: {
          kind: "occurrence",
          recurrenceId: "2026-07-21T09:00:00.000Z",
        },
      });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(true);
    });

    it("accepts an all-day instance", () => {
      const instance = baseInstance({ schedule: allDaySchedule });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(true);
    });

    it("preserves the description through validation (full-fidelity read)", () => {
      // Unlike the stripped occurrence feed (title only), the schema must keep
      // the description — the whole point of the full-fidelity read. Assert on
      // the PARSED output, not the input object, so this proves the schema.
      const parsed = SyncEventInstanceSchema.safeParse(
        baseInstance({ content: baseInstanceContent }),
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.content.description).toBe("Daily sync");
      }
    });

    it("rejects an instance whose content is missing the description", () => {
      const instance = baseInstance({ content: { title: "Standup" } });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(false);
    });

    it("rejects a calendarId that isn't a 24-character hex id", () => {
      const instance = baseInstance({ calendarId: "not-an-id" });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(false);
    });

    it("accepts providerManaged: true", () => {
      const instance = baseInstance({ providerManaged: true });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(true);
    });

    it("rejects providerManaged: false", () => {
      const instance = baseInstance({ providerManaged: false });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(false);
    });

    it('rejects providerManaged: "true"', () => {
      const instance = baseInstance({ providerManaged: "true" });
      expect(SyncEventInstanceSchema.safeParse(instance).success).toBe(false);
    });
  });

  describe("EventInstanceListQuerySchema", () => {
    const baseQuery = () => ({
      calendarIds: [objectId()],
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-08-01T00:00:00.000Z",
    });

    it("accepts a bounded range with at least one calendar", () => {
      expect(EventInstanceListQuerySchema.safeParse(baseQuery()).success).toBe(
        true,
      );
    });

    it("accepts an optional cursor and limit", () => {
      const query = { ...baseQuery(), cursor: "page-2", limit: 100 };
      expect(EventInstanceListQuerySchema.safeParse(query).success).toBe(true);
    });

    it("rejects an empty calendarIds array", () => {
      const query = { ...baseQuery(), calendarIds: [] };
      expect(EventInstanceListQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects end before start", () => {
      const query = {
        ...baseQuery(),
        start: baseQuery().end,
        end: baseQuery().start,
      };
      expect(EventInstanceListQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects a limit above the bound", () => {
      const query = { ...baseQuery(), limit: 501 };
      expect(EventInstanceListQuerySchema.safeParse(query).success).toBe(false);
    });
  });

  describe("EventInstanceListResponseSchema", () => {
    it("accepts an empty page with no next cursor", () => {
      const response = { instances: [], nextCursor: null };
      expect(EventInstanceListResponseSchema.safeParse(response).success).toBe(
        true,
      );
    });

    it("accepts a page with a next cursor", () => {
      const response = { instances: [], nextCursor: "page-2" };
      expect(EventInstanceListResponseSchema.safeParse(response).success).toBe(
        true,
      );
    });
  });
});
