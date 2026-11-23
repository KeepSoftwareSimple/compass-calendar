import {
  setPendingReflectionOptIn,
  takePendingReflectionOptIn,
} from "@web/components/WelcomeModal/pending-reflection-opt-in";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => localStorage.clear());

describe("pending reflection opt-in", () => {
  it("is read exactly once after sign-up", () => {
    setPendingReflectionOptIn(true);
    expect(takePendingReflectionOptIn()).toBe(true);
    expect(takePendingReflectionOptIn()).toBe(false);
  });

  it("forgets an earlier opt in when the visitor opts out", () => {
    setPendingReflectionOptIn(true);
    setPendingReflectionOptIn(false);
    expect(takePendingReflectionOptIn()).toBe(false);
  });
});
