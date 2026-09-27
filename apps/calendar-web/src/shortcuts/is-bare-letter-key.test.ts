import {
  isBareLetterKey,
  keyboardKey,
  normalizedKeyboardKey,
} from "@web/shortcuts/is-bare-letter-key";
import { describe, expect, it } from "bun:test";

const eventWithKey = (key: unknown): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "key", { get: () => key });
  return event;
};

describe("keyboardKey", () => {
  it("returns the key when it is a string", () => {
    expect(keyboardKey(eventWithKey("e"))).toBe("e");
  });

  it("returns empty string when key is missing", () => {
    expect(keyboardKey(eventWithKey(undefined))).toBe("");
    expect(keyboardKey(eventWithKey(null))).toBe("");
  });
});

describe("normalizedKeyboardKey", () => {
  it("lowercases single-character keys", () => {
    expect(normalizedKeyboardKey(eventWithKey("E"))).toBe("e");
  });

  it("leaves named keys unchanged", () => {
    expect(normalizedKeyboardKey(eventWithKey("Escape"))).toBe("Escape");
  });

  it("does not throw when key is missing", () => {
    expect(normalizedKeyboardKey(eventWithKey(undefined))).toBe("");
  });
});

describe("isBareLetterKey", () => {
  it("matches an unmodified letter", () => {
    expect(isBareLetterKey(eventWithKey("s"), "s")).toBe(true);
    expect(isBareLetterKey(eventWithKey("S"), "s")).toBe(true);
  });

  it("returns false instead of throwing when key is missing", () => {
    expect(isBareLetterKey(eventWithKey(undefined), "s")).toBe(false);
  });
});
