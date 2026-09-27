import {
  digitPickIndex,
  physicalDigitIndex,
} from "@web/shortcuts/digit-pick.util";
import { describe, expect, it } from "bun:test";

const event = (
  overrides: Partial<
    Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey">
  >,
) => ({
  code: "",
  key: "",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...overrides,
});

describe("digitPickIndex", () => {
  it("maps the physical top row to 0-based indices", () => {
    expect(digitPickIndex(event({ code: "Digit1", key: "1" }))).toBe(0);
    expect(digitPickIndex(event({ code: "Digit9", key: "9" }))).toBe(8);
    expect(digitPickIndex(event({ code: "Digit0", key: "0" }))).toBe(9);
    expect(digitPickIndex(event({ code: "Minus", key: "-" }))).toBe(10);
    expect(digitPickIndex(event({ code: "Equal", key: "=" }))).toBe(11);
  });

  it("falls back to a plain digit key for numpad input", () => {
    expect(digitPickIndex(event({ code: "Numpad3", key: "3" }))).toBe(2);
  });

  it("matches AZERTY's unshifted top row by physical code", () => {
    expect(digitPickIndex(event({ code: "Digit1", key: "&" }))).toBe(0);
  });

  it("ignores Ctrl, Meta, and Alt combinations", () => {
    expect(digitPickIndex(event({ code: "Digit1", ctrlKey: true }))).toBeNull();
    expect(digitPickIndex(event({ code: "Digit1", metaKey: true }))).toBeNull();
    expect(digitPickIndex(event({ code: "Digit1", altKey: true }))).toBeNull();
  });

  it("returns null for non-digit keys", () => {
    expect(digitPickIndex(event({ code: "KeyA", key: "a" }))).toBeNull();
    expect(
      digitPickIndex(event({ code: "ArrowRight", key: "ArrowRight" })),
    ).toBeNull();
  });
});

describe("physicalDigitIndex", () => {
  it("matches the physical top row and numpad fallback like digitPickIndex", () => {
    expect(physicalDigitIndex(event({ code: "Digit1", key: "1" }))).toBe(0);
    expect(physicalDigitIndex(event({ code: "Numpad3", key: "3" }))).toBe(2);
    expect(physicalDigitIndex(event({ code: "KeyA", key: "a" }))).toBeNull();
  });

  it("ignores modifiers, unlike digitPickIndex", () => {
    expect(physicalDigitIndex(event({ code: "Digit1", metaKey: true }))).toBe(
      0,
    );
    expect(physicalDigitIndex(event({ code: "Digit1", ctrlKey: true }))).toBe(
      0,
    );
  });
});
