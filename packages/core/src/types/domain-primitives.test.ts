import { faker } from "@faker-js/faker";
import {
  type CalendarId,
  CalendarIdSchema,
  DateOnlySchema,
  DateTimeSchema,
  type EventId,
  EventIdSchema,
  RRuleSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { describe, expect, expectTypeOf, it } from "bun:test";

describe("Domain Primitives", () => {
  describe("EventIdSchema", () => {
    it("accepts a 24-character hex id", () => {
      expect(
        EventIdSchema.safeParse(faker.database.mongodbObjectId()).success,
      ).toBe(true);
    });

    it("accepts a composed occurrence id", () => {
      // S39 D1=II: projected instances use `${eventId}::${recurrenceId}`.
      const composed = `${faker.database.mongodbObjectId()}::2026-07-14T15:00:00.000Z`;
      expect(EventIdSchema.safeParse(composed).success).toBe(true);
    });

    it("rejects an empty id", () => {
      expect(EventIdSchema.safeParse("").success).toBe(false);
    });

    it("rejects a whitespace-only id", () => {
      expect(EventIdSchema.safeParse("   ").success).toBe(false);
    });
  });

  describe("CalendarIdSchema", () => {
    it("accepts a 24-character hex id", () => {
      expect(
        CalendarIdSchema.safeParse(faker.database.mongodbObjectId()).success,
      ).toBe(true);
    });

    it("rejects a short id", () => {
      expect(CalendarIdSchema.safeParse("abc123").success).toBe(false);
    });

    it("rejects a non-hex id", () => {
      expect(CalendarIdSchema.safeParse("g".repeat(24)).success).toBe(false);
    });
  });

  describe("DateOnlySchema", () => {
    it("accepts a valid calendar date", () => {
      expect(DateOnlySchema.safeParse("2026-07-14").success).toBe(true);
    });

    it("accepts a leap day", () => {
      expect(DateOnlySchema.safeParse("2024-02-29").success).toBe(true);
    });

    it("rejects a rollover day (Feb 30)", () => {
      expect(DateOnlySchema.safeParse("2026-02-30").success).toBe(false);
    });

    it("rejects a rollover month (month 13)", () => {
      expect(DateOnlySchema.safeParse("2026-13-01").success).toBe(false);
    });

    it("rejects a non-zero-padded date", () => {
      expect(DateOnlySchema.safeParse("2026-7-4").success).toBe(false);
    });
  });

  describe("DateTimeSchema", () => {
    it("accepts a Z-offset timestamp", () => {
      expect(DateTimeSchema.safeParse("2026-07-14T10:00:00Z").success).toBe(
        true,
      );
    });

    it("accepts a numeric-offset timestamp", () => {
      expect(
        DateTimeSchema.safeParse("2026-07-14T10:00:00-06:00").success,
      ).toBe(true);
    });

    it("rejects a timestamp with no offset", () => {
      expect(DateTimeSchema.safeParse("2026-07-14T10:00:00").success).toBe(
        false,
      );
    });
  });

  describe("TimeZoneSchema", () => {
    it("accepts a valid IANA time zone", () => {
      expect(TimeZoneSchema.safeParse("America/Denver").success).toBe(true);
    });

    it("rejects an invalid time zone", () => {
      expect(TimeZoneSchema.safeParse("Not/AZone").success).toBe(false);
    });
  });

  describe("RRuleSchema", () => {
    it("rejects an empty array", () => {
      expect(RRuleSchema.safeParse([]).success).toBe(false);
    });

    it("rejects an array containing an empty string", () => {
      expect(RRuleSchema.safeParse([""]).success).toBe(false);
    });

    it("accepts a non-empty array of rule lines", () => {
      expect(RRuleSchema.safeParse(["RRULE:FREQ=WEEKLY"]).success).toBe(true);
    });
  });
});

it("keeps production identity brands distinct in the node test project", () => {
  expectTypeOf<string>().not.toMatchTypeOf<EventId>();
  expectTypeOf<EventId>().not.toMatchTypeOf<CalendarId>();
  expectTypeOf<ConnectionId>().not.toMatchTypeOf<PrincipalId>();
  expectTypeOf<PrincipalId>().not.toMatchTypeOf<TenantId>();
});
