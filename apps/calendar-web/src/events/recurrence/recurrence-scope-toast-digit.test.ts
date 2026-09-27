import { recurrenceScopeForToastDigit } from "./recurrence-scope-toast-digit";
import { describe, expect, it } from "bun:test";

const digit = (value: string) =>
  ({
    key: value,
    code: `Digit${value}`,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
  }) as Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey">;

describe("recurrenceScopeForToastDigit", () => {
  it("maps 1 to following, 2 to all, and leaves other digits alone", () => {
    expect(recurrenceScopeForToastDigit(digit("1"))).toBe("thisAndFollowing");
    expect(recurrenceScopeForToastDigit(digit("2"))).toBe("all");
    expect(recurrenceScopeForToastDigit(digit("3"))).toBeNull();
  });
});
