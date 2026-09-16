import { faker } from "@faker-js/faker";
import { ZodError, z } from "zod/v4";
import { EventSchema } from "@core/types/event.contracts";
import {
  IDSchemaV4,
  RGBHexSchema,
  TimezoneSchema,
} from "@core/types/type.utils";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

describe("IDSchemaV4", () => {
  it("validates a correct ObjectId string", () => {
    const validId = faker.database.mongodbObjectId();

    expect(IDSchemaV4.safeParse(validId).success).toBe(true);
  });

  it("rejects an invalid ObjectId string", () => {
    const invalidId = faker.string.ulid();
    const result = IDSchemaV4.safeParse(invalidId);

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(ZodError);
    expect(z.treeifyError(result.error!).errors).toEqual(["Invalid id"]);
  });

  it("rejects a 12-character string that bson ObjectId.isValid would accept", () => {
    const twelveBytes = "abcdefghijkl";
    expect(IDSchemaV4.safeParse(twelveBytes).success).toBe(false);
  });
});

describe("TimezoneSchema", () => {
  let dateTimeFormatSpy: ReturnType<typeof spyOn> | undefined;

  afterEach(() => {
    dateTimeFormatSpy?.mockRestore();
    dateTimeFormatSpy = undefined;
  });

  it("constructs Intl.DateTimeFormat once for 1,000 timed events in one zone", () => {
    const timeZone = "Etc/GMT-13";
    const spy = spyOn(globalThis.Intl, "DateTimeFormat");
    dateTimeFormatSpy = spy;

    for (let index = 0; index < 1000; index++) {
      const result = EventSchema.safeParse({
        id: faker.database.mongodbObjectId(),
        calendarId: faker.database.mongodbObjectId(),
        content: { kind: "details", title: "Standup", description: "Daily" },
        schedule: {
          kind: "timed",
          start: "2026-07-14T09:00:00.000Z",
          end: "2026-07-14T09:30:00.000Z",
          timeZone,
        },
        recurrence: { kind: "single" },
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: null,
      });

      expect(result.success).toBe(true);
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toEqual({ timeZone });
  });

  it("validates a correct timezone string", () => {
    const timezone = faker.location.timeZone();

    expect(TimezoneSchema.safeParse(timezone).success).toBe(true);
  });

  it("rejects an invalid timezone string", () => {
    const invalidTimezone = "Not/AZone";
    const result = TimezoneSchema.safeParse(invalidTimezone);

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(ZodError);
    expect(z.treeifyError(result.error!).errors).toEqual(["Invalid timezone"]);
  });

  describe("RGBHexSchema", () => {
    it("validates a correct 7-character hex color code", () => {
      const validHex = faker.color.rgb();

      expect(RGBHexSchema.safeParse(validHex).success).toBe(true);
    });

    it("accepts uppercase hex digits", () => {
      const validHex = faker.color.rgb({ casing: "upper" });

      expect(RGBHexSchema.safeParse(validHex).success).toBe(true);
    });

    it("rejects hex codes without #", () => {
      const invalidHex = faker.color.rgb({ prefix: "" });
      const result = RGBHexSchema.safeParse(invalidHex);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(z.treeifyError(result.error!).errors).toEqual([
        "Invalid color. Must be a 7-character hex color code.",
      ]);
    });

    it("rejects hex codes with wrong length", () => {
      const invalidHex = faker.color.rgb().slice(0, 6);
      const result = RGBHexSchema.safeParse(invalidHex);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(z.treeifyError(result.error!).errors).toEqual([
        "Invalid color. Must be a 7-character hex color code.",
      ]);
    });

    it("rejects hex codes with invalid characters", () => {
      const invalidHex = "#12g45z";
      const result = RGBHexSchema.safeParse(invalidHex);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(ZodError);
      expect(z.treeifyError(result.error!).errors).toEqual([
        "Invalid color. Must be a 7-character hex color code.",
      ]);
    });
  });
});
