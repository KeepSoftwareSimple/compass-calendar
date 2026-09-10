import { faker } from "@faker-js/faker";
import {
  AvailabilityQuerySchema,
  CreateEventInputSchema,
  DeleteEventInputSchema,
  EventListQuerySchema,
  EventListResponseSchema,
  EventMutationErrorSchema,
  ReplaceEventInputSchema,
  RsvpEventInputSchema,
} from "@core/types/event-command.contracts";

const calendarId = () => faker.database.mongodbObjectId();
const eventId = () => faker.database.mongodbObjectId();

const content = {
  kind: "details",
  title: "Standup",
  description: "",
  location: "",
} as const;
const timedSchedule = {
  kind: "timed",
  start: "2026-07-14T09:00:00-06:00",
  end: "2026-07-14T10:00:00-06:00",
  timeZone: "America/Denver",
} as const;
describe("Event Command Contracts", () => {
  describe("CreateEventInputSchema", () => {
    const base = () => ({
      calendarId: calendarId(),
      content,
      schedule: timedSchedule,
      recurrence: { kind: "single" as const },
    });

    it("parses without an id", () => {
      expect(CreateEventInputSchema.safeParse(base()).success).toBe(true);
    });

    it("parses with an optional client-generated id", () => {
      const input = { ...base(), id: eventId() };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("rejects an occurrence recurrence", () => {
      const input = {
        ...base(),
        recurrence: { kind: "occurrence", seriesId: eventId() },
      };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects provider fields", () => {
      const input = {
        ...base(),
        externalReference: {
          provider: "google",
          eventId: "abc",
          recurringEventId: null,
        },
      };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects unknown keys", () => {
      const input = { ...base(), extra: true };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("parses a legacy payload without attendees or invitation to an identical output", () => {
      const legacy = base();
      const parsed = CreateEventInputSchema.parse(legacy);

      expect(parsed).toStrictEqual(legacy);
    });

    it("accepts content attendees alongside an invitation intent", () => {
      const input = {
        ...base(),
        content: {
          ...content,
          attendees: [
            { email: "ada@example.com", displayName: "Ada" },
            { email: "grace@example.com", displayName: null },
          ],
        },
        invitation: "all",
      };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("accepts an empty attendee list — replace membership with none", () => {
      const input = { ...base(), content: { ...content, attendees: [] } };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("rejects duplicate attendee emails differing only by case", () => {
      const input = {
        ...base(),
        content: {
          ...content,
          attendees: [
            { email: "ada@example.com", displayName: null },
            { email: "Ada@Example.com", displayName: null },
          ],
        },
      };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects an attendee carrying a responseStatus", () => {
      const input = {
        ...base(),
        content: {
          ...content,
          attendees: [
            {
              email: "ada@example.com",
              displayName: null,
              responseStatus: "accepted",
            },
          ],
        },
      };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects an unrecognized invitation intent", () => {
      const input = { ...base(), invitation: "everyone" };

      expect(CreateEventInputSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("ReplaceEventInputSchema", () => {
    const base = (overrides: Record<string, unknown> = {}) => ({
      content,
      schedule: timedSchedule,
      recurrence: { kind: "preserve" as const },
      scope: "this" as const,
      ...overrides,
    });

    it("accepts a preserve recurrence edit", () => {
      expect(ReplaceEventInputSchema.safeParse(base()).success).toBe(true);
    });

    it("accepts a single recurrence edit", () => {
      const input = base({ recurrence: { kind: "single" } });

      expect(ReplaceEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("accepts a series recurrence edit", () => {
      const input = base({
        recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
      });

      expect(ReplaceEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("accepts every recurrence scope value", () => {
      for (const scope of ["this", "thisAndFollowing", "all"] as const) {
        expect(ReplaceEventInputSchema.safeParse(base({ scope })).success).toBe(
          true,
        );
      }
    });

    it("rejects an unknown scope", () => {
      const input = base({ scope: "future" });

      expect(ReplaceEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("parses a legacy payload without attendees or invitation to an identical output", () => {
      const legacy = base();
      const parsed = ReplaceEventInputSchema.parse(legacy);

      expect(parsed).toStrictEqual(legacy);
    });

    it("accepts a replace with two attendees and invitation all", () => {
      const input = base({
        content: {
          ...content,
          attendees: [
            { email: "ada@example.com", displayName: "Ada" },
            { email: "grace@example.com", displayName: null },
          ],
        },
        invitation: "all",
      });

      expect(ReplaceEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("rejects duplicate attendee emails", () => {
      const input = base({
        content: {
          ...content,
          attendees: [
            { email: "ada@example.com", displayName: null },
            { email: "ada@example.com", displayName: null },
          ],
        },
      });

      expect(ReplaceEventInputSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("DeleteEventInputSchema", () => {
    it("accepts a valid scope", () => {
      expect(DeleteEventInputSchema.safeParse({ scope: "all" }).success).toBe(
        true,
      );
    });

    it("rejects an unknown scope", () => {
      expect(
        DeleteEventInputSchema.safeParse({ scope: "future" }).success,
      ).toBe(false);
    });

    it("rejects unknown keys", () => {
      const result = DeleteEventInputSchema.safeParse({
        scope: "all",
        extra: 1,
      });

      expect(result.success).toBe(false);
    });

    it("accepts a cancellation invitation intent", () => {
      const input = { scope: "all", invitation: "all" };

      expect(DeleteEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("parses a legacy payload without an invitation to an identical output", () => {
      const legacy = { scope: "all" as const };

      expect(DeleteEventInputSchema.parse(legacy)).toStrictEqual(legacy);
    });
  });

  describe("RsvpEventInputSchema", () => {
    it.each([
      ["accepted", "single"],
      ["declined", "all"],
      ["tentative", "single"],
    ] as const)("accepts responseStatus %s with scope %s", (responseStatus, scope) => {
      const input = { responseStatus, scope };

      expect(RsvpEventInputSchema.safeParse(input).success).toBe(true);
    });

    it("rejects needsAction — un-answering is not an RSVP", () => {
      const input = { responseStatus: "needsAction", scope: "single" };

      expect(RsvpEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects a missing scope", () => {
      const input = { responseStatus: "accepted" };

      expect(RsvpEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects a recurrence-edit scope value", () => {
      const input = { responseStatus: "accepted", scope: "thisAndFollowing" };

      expect(RsvpEventInputSchema.safeParse(input).success).toBe(false);
    });

    it("rejects unknown keys", () => {
      const input = { responseStatus: "accepted", scope: "single", extra: 1 };

      expect(RsvpEventInputSchema.safeParse(input).success).toBe(false);
    });
  });

  describe("EventListQuerySchema", () => {
    it("parses a range query", () => {
      const query = {
        kind: "range",
        start: "2026-07-14T00:00:00Z",
        end: "2026-07-21T00:00:00Z",
      };

      expect(EventListQuerySchema.safeParse(query).success).toBe(true);
    });

    it("parses a range query with unique calendarIds", () => {
      const query = {
        kind: "range",
        start: "2026-07-14T00:00:00Z",
        end: "2026-07-21T00:00:00Z",
        calendarIds: [calendarId(), calendarId()],
      };

      expect(EventListQuerySchema.safeParse(query).success).toBe(true);
    });

    it("rejects duplicate calendarIds", () => {
      const id = calendarId();
      const query = {
        kind: "range",
        start: "2026-07-14T00:00:00Z",
        end: "2026-07-21T00:00:00Z",
        calendarIds: [id, id],
      };

      expect(EventListQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects a range end before start", () => {
      const query = {
        kind: "range",
        start: "2026-07-21T00:00:00Z",
        end: "2026-07-14T00:00:00Z",
      };

      expect(EventListQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects a someday query now that the kind is removed", () => {
      const query = {
        kind: "someday",
        period: "month",
        anchorDate: "2026-07-01",
      };

      expect(EventListQuerySchema.safeParse(query).success).toBe(false);
    });
  });

  describe("EventListResponseSchema", () => {
    it("accepts an events-only payload", () => {
      expect(EventListResponseSchema.safeParse({ events: [] }).success).toBe(
        true,
      );
    });

    it("rejects unknown keys alongside events", () => {
      const result = EventListResponseSchema.safeParse({
        events: [],
        nextCursor: null,
      });

      expect(result.success).toBe(false);
    });
  });

  describe("AvailabilityQuerySchema", () => {
    it("accepts unique calendar ids with end after start", () => {
      const query = {
        calendarIds: [calendarId(), calendarId()],
        start: "2026-07-14T00:00:00Z",
        end: "2026-07-14T01:00:00Z",
      };

      expect(AvailabilityQuerySchema.safeParse(query).success).toBe(true);
    });

    it("rejects duplicate calendar ids", () => {
      const id = calendarId();
      const query = {
        calendarIds: [id, id],
        start: "2026-07-14T00:00:00Z",
        end: "2026-07-14T01:00:00Z",
      };

      expect(AvailabilityQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects end before or equal to start", () => {
      const query = {
        calendarIds: [calendarId()],
        start: "2026-07-14T01:00:00Z",
        end: "2026-07-14T00:00:00Z",
      };

      expect(AvailabilityQuerySchema.safeParse(query).success).toBe(false);
    });
  });

  describe("EventMutationErrorSchema", () => {
    it("accepts every mutation error code", () => {
      const codes = [
        "EVENT_NOT_FOUND",
        "CALENDAR_NOT_FOUND",
        "CALENDAR_READ_ONLY",
        "RECURRENCE_CONFLICT",
        "DUPLICATE_EVENT_ID",
        "INVALID_SCHEDULE",
        "PROVIDER_FAILURE",
        "GOOGLE_REVOKED",
        "CONNECTION_REVOKED",
        "MAINTENANCE",
      ] as const;

      for (const code of codes) {
        const error = { code, message: "failed", retryable: false };

        expect(EventMutationErrorSchema.safeParse(error).success).toBe(true);
      }
    });

    it("rejects an unrecognized code", () => {
      const error = { code: "WAT", message: "failed", retryable: false };

      expect(EventMutationErrorSchema.safeParse(error).success).toBe(false);
    });

    it("rejects an empty message", () => {
      const error = {
        code: "EVENT_NOT_FOUND",
        message: "",
        retryable: false,
      };

      expect(EventMutationErrorSchema.safeParse(error).success).toBe(false);
    });
  });
});
