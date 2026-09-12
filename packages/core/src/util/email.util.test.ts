import { normalizeEmail, normalizeEmailOrNull } from "@core/util/email.util";
import { describe, expect, it } from "bun:test";

describe("normalizeEmail", () => {
  it("folds case and strips surrounding whitespace", () => {
    expect(normalizeEmail("  Ahab@Pequod.com \n")).toBe("ahab@pequod.com");
  });

  it("leaves an already-normalized address alone", () => {
    expect(normalizeEmail("ahab@pequod.com")).toBe("ahab@pequod.com");
  });
});

describe("normalizeEmailOrNull", () => {
  it("normalizes a present address", () => {
    expect(normalizeEmailOrNull(" Ahab@Pequod.com ")).toBe("ahab@pequod.com");
  });

  it("returns null for absent or whitespace-only values", () => {
    expect(normalizeEmailOrNull(undefined)).toBeNull();
    expect(normalizeEmailOrNull(null)).toBeNull();
    expect(normalizeEmailOrNull("")).toBeNull();
    expect(normalizeEmailOrNull("   ")).toBeNull();
  });
});
