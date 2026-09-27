import {
  CONTINUE_WITH_LABEL,
  signInProviderForShortcutLetter,
} from "./sign-in-provider.util";
import { describe, expect, it } from "bun:test";

describe("signInProviderForShortcutLetter", () => {
  it("maps shortcut letters to configured providers", () => {
    const available = ["google", "microsoft", "apple"] as const;
    expect(signInProviderForShortcutLetter("g", available)).toBe("google");
    expect(signInProviderForShortcutLetter("M", available)).toBe("microsoft");
    expect(signInProviderForShortcutLetter("a", available)).toBe("apple");
    expect(signInProviderForShortcutLetter("x", available)).toBeUndefined();
  });

  it("ignores providers that are not available", () => {
    expect(signInProviderForShortcutLetter("m", ["google"])).toBeUndefined();
  });
});

describe("CONTINUE_WITH_LABEL", () => {
  it("uses whole-string provider labels", () => {
    expect(CONTINUE_WITH_LABEL.google).toBe("Continue with Google");
    expect(CONTINUE_WITH_LABEL.microsoft).toBe("Continue with Microsoft");
    expect(CONTINUE_WITH_LABEL.apple).toBe("Continue with Apple");
  });
});
