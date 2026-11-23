import {
  clearPendingReflectionOptIn,
  peekPendingReflectionOptIn,
  setPendingReflectionOptIn,
} from "@web/components/WelcomeModal/pending-reflection-opt-in";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => localStorage.clear());

describe("pending reflection opt-in", () => {
  it("stays pending until it is cleared after a successful save", () => {
    setPendingReflectionOptIn(true);
    expect(peekPendingReflectionOptIn()).toBe(true);
    expect(peekPendingReflectionOptIn()).toBe(true);
    clearPendingReflectionOptIn();
    expect(peekPendingReflectionOptIn()).toBe(false);
  });

  it("forgets an earlier opt in when the visitor opts out", () => {
    setPendingReflectionOptIn(true);
    setPendingReflectionOptIn(false);
    expect(peekPendingReflectionOptIn()).toBe(false);
  });
});
