import { faker } from "@faker-js/faker";
import {
  BusyConnectionEvidenceSchema,
  BusyIntervalSchema,
  BusyQueryPurposeSchema,
  BusyQueryResponseSchema,
  BusyQuerySchema,
  IncompleteCalendarReasonSchema,
} from "@core/types/sync/busy.contracts";

const objectId = () => faker.database.mongodbObjectId();

const baseQuery = () => ({
  calendarIds: [objectId()],
  start: "2026-07-01T00:00:00.000Z",
  end: "2026-08-01T00:00:00.000Z",
  purpose: "display",
});

const baseInterval = () => ({
  start: "2026-07-14T09:00:00.000Z",
  end: "2026-07-14T10:00:00.000Z",
});

const baseResponse = () => ({
  intervals: [baseInterval()],
  computedAt: "2026-07-20T12:00:00.000Z",
  connections: [],
  complete: true,
  incompleteCalendars: [],
  bookable: true,
});

describe("Sync busy contracts", () => {
  describe("BusyIntervalSchema", () => {
    it("accepts a half-open interval", () => {
      expect(BusyIntervalSchema.safeParse(baseInterval()).success).toBe(true);
    });

    it("rejects end equal to start", () => {
      const interval = {
        start: baseInterval().start,
        end: baseInterval().start,
      };
      expect(BusyIntervalSchema.safeParse(interval).success).toBe(false);
    });

    it("rejects end before start", () => {
      const interval = { start: baseInterval().end, end: baseInterval().start };
      expect(BusyIntervalSchema.safeParse(interval).success).toBe(false);
    });

    it("strips a title field so event content never appears on a busy interval", () => {
      const parsed = BusyIntervalSchema.parse({
        ...baseInterval(),
        title: "Therapy",
      });
      expect("title" in parsed).toBe(false);
    });

    it("strips a calendarId field so intervals stay merged and normalized", () => {
      const parsed = BusyIntervalSchema.parse({
        ...baseInterval(),
        calendarId: objectId(),
      });
      expect("calendarId" in parsed).toBe(false);
    });
  });

  describe("BusyQueryPurposeSchema", () => {
    it.each(["display", "bookingConfirmation"] as const)(
      "accepts %s",
      (purpose) => {
        expect(BusyQueryPurposeSchema.safeParse(purpose).success).toBe(true);
      },
    );

    it("rejects an unknown purpose", () => {
      expect(BusyQueryPurposeSchema.safeParse("debugging").success).toBe(false);
    });
  });

  describe("BusyQuerySchema", () => {
    it("accepts a single-calendar query", () => {
      expect(BusyQuerySchema.safeParse(baseQuery()).success).toBe(true);
    });

    it("accepts multiple calendars across compass and provider id spaces", () => {
      const query = { ...baseQuery(), calendarIds: [objectId(), objectId()] };
      expect(BusyQuerySchema.safeParse(query).success).toBe(true);
    });

    it("accepts an optional maxDataAgeSeconds", () => {
      const query = { ...baseQuery(), maxDataAgeSeconds: 30 };
      expect(BusyQuerySchema.safeParse(query).success).toBe(true);
    });

    it("rejects an empty calendarIds array", () => {
      const query = { ...baseQuery(), calendarIds: [] };
      expect(BusyQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects end before start", () => {
      const query = {
        ...baseQuery(),
        start: baseQuery().end,
        end: baseQuery().start,
      };
      expect(BusyQuerySchema.safeParse(query).success).toBe(false);
    });

    it("accepts a range at exactly the 366-day ceiling", () => {
      const query = {
        ...baseQuery(),
        start: "2026-01-01T00:00:00.000Z",
        end: "2027-01-02T00:00:00.000Z",
      };
      expect(BusyQuerySchema.safeParse(query).success).toBe(true);
    });

    it("rejects a range exceeding the 366-day ceiling (12 months is a floor, not unbounded)", () => {
      const query = {
        ...baseQuery(),
        start: "2026-01-01T00:00:00.000Z",
        end: "2027-01-03T00:00:00.000Z",
      };
      expect(BusyQuerySchema.safeParse(query).success).toBe(false);
    });

    it("rejects principal scoping via the query body", () => {
      const query = { ...baseQuery(), principalId: objectId() };
      expect(BusyQuerySchema.safeParse(query).success).toBe(false);
    });
  });

  describe("BusyConnectionEvidenceSchema", () => {
    it("accepts null timestamps before first sync", () => {
      const evidence = {
        connectionId: objectId(),
        lastSyncedAt: null,
        lastHealthyAt: null,
      };
      expect(BusyConnectionEvidenceSchema.safeParse(evidence).success).toBe(
        true,
      );
    });

    it("strips an unknown field so a rolling deploy cannot 502", () => {
      const parsed = BusyConnectionEvidenceSchema.parse({
        connectionId: objectId(),
        lastSyncedAt: null,
        lastHealthyAt: null,
        healthy: true,
      });
      expect("healthy" in parsed).toBe(false);
    });
  });

  describe("IncompleteCalendarReasonSchema", () => {
    it.each([
      "missing",
      "stale",
      "connectionUnhealthy",
      "capabilityUnavailable",
    ] as const)("accepts %s", (reason) => {
      expect(IncompleteCalendarReasonSchema.safeParse(reason).success).toBe(
        true,
      );
    });
  });

  describe("BusyQueryResponseSchema", () => {
    it("accepts a complete, bookable response", () => {
      expect(BusyQueryResponseSchema.safeParse(baseResponse()).success).toBe(
        true,
      );
    });

    it("accepts an incomplete, unbookable response with reasons", () => {
      const response = {
        ...baseResponse(),
        complete: false,
        incompleteCalendars: [{ calendarId: objectId(), reason: "stale" }],
        bookable: false,
      };
      expect(BusyQueryResponseSchema.safeParse(response).success).toBe(true);
    });

    it("rejects complete=true with a non-empty incompleteCalendars list", () => {
      const response = {
        ...baseResponse(),
        incompleteCalendars: [{ calendarId: objectId(), reason: "missing" }],
      };
      expect(BusyQueryResponseSchema.safeParse(response).success).toBe(false);
    });

    it("rejects complete=false with an empty incompleteCalendars list", () => {
      const response = { ...baseResponse(), complete: false, bookable: false };
      expect(BusyQueryResponseSchema.safeParse(response).success).toBe(false);
    });

    it("rejects bookable=true when complete is false (fail-closed)", () => {
      const response = {
        ...baseResponse(),
        complete: false,
        incompleteCalendars: [{ calendarId: objectId(), reason: "stale" }],
        bookable: true,
      };
      expect(BusyQueryResponseSchema.safeParse(response).success).toBe(false);
    });

    it("strips attendee content on an interval so the busy wire stays private", () => {
      const parsed = BusyQueryResponseSchema.parse({
        ...baseResponse(),
        intervals: [{ ...baseInterval(), attendees: ["guest@example.com"] }],
      });
      expect("attendees" in parsed.intervals[0]!).toBe(false);
    });
  });
});
