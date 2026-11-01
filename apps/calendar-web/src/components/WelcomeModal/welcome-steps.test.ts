import {
  FIRST_WELCOME_STEP,
  LAST_WELCOME_STEP,
  nextWelcomeStep,
  previousWelcomeStep,
  WELCOME_STEPS,
} from "@web/components/WelcomeModal/welcome-steps";
import { describe, expect, it } from "bun:test";

describe("welcome steps", () => {
  it("advances through every screen and stops on the last", () => {
    expect(nextWelcomeStep(1)).toBe(2);
    expect(nextWelcomeStep(2)).toBe(3);
    expect(nextWelcomeStep(3)).toBe(4);
    expect(nextWelcomeStep(LAST_WELCOME_STEP)).toBe(LAST_WELCOME_STEP);
  });

  it("steps back through every screen and stops on the first", () => {
    expect(previousWelcomeStep(4)).toBe(3);
    expect(previousWelcomeStep(3)).toBe(2);
    expect(previousWelcomeStep(2)).toBe(1);
    expect(previousWelcomeStep(FIRST_WELCOME_STEP)).toBe(FIRST_WELCOME_STEP);
  });

  it("keeps the dot list in step with the first and last screen", () => {
    expect(WELCOME_STEPS[0]).toBe(FIRST_WELCOME_STEP);
    expect(WELCOME_STEPS[WELCOME_STEPS.length - 1]).toBe(LAST_WELCOME_STEP);
  });
});
