import {
  LifePreferencesSchema,
  ReflectionPreferencesSchema,
} from "@core/types/life-preferences.contracts";
import { describe, expect, it } from "bun:test";

describe("life and reflection contracts", () => {
  it("requires explicit settings and accepts an unconfirmed birthday", () => {
    expect(LifePreferencesSchema.safeParse({}).success).toBe(false);
    expect(
      LifePreferencesSchema.safeParse({
        birthDate: "",
        lifespan: 79,
        variation: "average",
      }).success,
    ).toBe(true);
    expect(
      LifePreferencesSchema.safeParse({
        birthDate: "2025-02-29",
        lifespan: 79,
        variation: "average",
      }).success,
    ).toBe(false);
  });
  it("validates timezone rules rather than accepting a fixed ambiguous abbreviation", () => {
    expect(
      ReflectionPreferencesSchema.safeParse({
        enabled: true,
        timeZone: "America/Denver",
      }).success,
    ).toBe(true);
    expect(
      ReflectionPreferencesSchema.safeParse({
        enabled: true,
        timeZone: "unknown/timezone",
      }).success,
    ).toBe(false);
  });
});
