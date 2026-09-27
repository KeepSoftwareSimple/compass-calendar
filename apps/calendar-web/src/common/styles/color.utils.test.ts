import { brighten, darken, isDark } from "./color.utils";
import { describe, expect, it } from "bun:test";

describe("color.utils", () => {
  it("adjusts colors", () => {
    expect(brighten("#123456", 15)).toBe("#385a7c");
    expect(darken("#abcdef", 20)).toBe("#559adf");
  });

  it("identifies dark colors", () => {
    expect(isDark("#000000")).toBe(true);
    expect(isDark("#ffffff")).toBe(false);
  });
});
