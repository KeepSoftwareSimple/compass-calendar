import {
  isSignupStep,
  SIGNUP_STEPS,
  type SignupStep,
  signupStepViewedProperties,
} from "@web/auth/posthog/signup-step-viewed.properties";
import { describe, expect, it } from "bun:test";

describe("signupStepViewedProperties", () => {
  it("always includes matching step and step_name", () => {
    const properties = signupStepViewedProperties("welcome_viewed", {
      source: "welcome_modal",
    });

    expect(properties).toEqual({
      step: "welcome_viewed",
      step_name: "welcome_viewed",
      source: "welcome_modal",
    });
  });

  it("drops undefined optional fields", () => {
    expect(
      signupStepViewedProperties("auth_modal_opened", { method: undefined }),
    ).toEqual({
      step: "auth_modal_opened",
      step_name: "auth_modal_opened",
    });
  });

  it("rejects a missing or empty step", () => {
    expect(() => signupStepViewedProperties("" as SignupStep)).toThrow(
      /non-empty step/,
    );
    expect(isSignupStep("")).toBe(false);
    expect(isSignupStep(undefined)).toBe(false);
  });

  it("lists every SignupStep exactly once", () => {
    expect(SIGNUP_STEPS.length).toBe(16);
    expect(new Set(SIGNUP_STEPS).size).toBe(SIGNUP_STEPS.length);
    for (const step of SIGNUP_STEPS) {
      expect(isSignupStep(step)).toBe(true);
    }
  });
});
