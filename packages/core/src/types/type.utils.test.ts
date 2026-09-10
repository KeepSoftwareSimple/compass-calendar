import { faker } from "@faker-js/faker";
import { ZodError, z } from "zod/v4";
import {
  IDSchemaV4,
  RGBHexSchema,
  TimezoneSchema,
} from "@core/types/type.utils";

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
});

describe("TimezoneSchema", () => {
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
