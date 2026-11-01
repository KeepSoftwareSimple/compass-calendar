import {
  hasAnyModifier,
  hasCommandModifier,
  isModKeyHeld,
  isPlainEnterKey,
} from "@web/shortcuts/keyboard-modifiers.util";
import { describe, expect, it } from "bun:test";

const event = (
  overrides: Partial<{
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  }> = {},
) => ({
  key: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...overrides,
});

describe("isModKeyHeld", () => {
  it("accepts either platform's Mod key", () => {
    expect(isModKeyHeld(event({ metaKey: true }))).toBe(true);
    expect(isModKeyHeld(event({ ctrlKey: true }))).toBe(true);
  });

  it("ignores Alt and Shift", () => {
    expect(isModKeyHeld(event({ altKey: true, shiftKey: true }))).toBe(false);
  });
});

describe("hasCommandModifier", () => {
  it("counts Mod and Alt", () => {
    expect(hasCommandModifier(event({ metaKey: true }))).toBe(true);
    expect(hasCommandModifier(event({ ctrlKey: true }))).toBe(true);
    expect(hasCommandModifier(event({ altKey: true }))).toBe(true);
  });

  it("lets a shifted character through", () => {
    expect(hasCommandModifier(event({ shiftKey: true }))).toBe(false);
  });
});

describe("hasAnyModifier", () => {
  it("is true for every modifier, Shift included", () => {
    expect(hasAnyModifier(event({ metaKey: true }))).toBe(true);
    expect(hasAnyModifier(event({ ctrlKey: true }))).toBe(true);
    expect(hasAnyModifier(event({ altKey: true }))).toBe(true);
    expect(hasAnyModifier(event({ shiftKey: true }))).toBe(true);
  });

  it("is false for a bare key", () => {
    expect(hasAnyModifier(event())).toBe(false);
  });
});

describe("isPlainEnterKey", () => {
  it("matches an unmodified Enter", () => {
    expect(isPlainEnterKey(event({ key: "Enter" }))).toBe(true);
  });

  it("leaves Mod+Enter and Shift+Enter to their own handlers", () => {
    expect(isPlainEnterKey(event({ key: "Enter", metaKey: true }))).toBe(false);
    expect(isPlainEnterKey(event({ key: "Enter", ctrlKey: true }))).toBe(false);
    expect(isPlainEnterKey(event({ key: "Enter", shiftKey: true }))).toBe(
      false,
    );
    expect(isPlainEnterKey(event({ key: "Enter", altKey: true }))).toBe(false);
  });

  it("is false for any other key", () => {
    expect(isPlainEnterKey(event({ key: " " }))).toBe(false);
  });
});
