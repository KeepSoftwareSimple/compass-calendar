import {
  nextSetupStep,
  prevSetupStep,
  setupStepProgress,
  setupStepSentence,
  visibleSetupSteps,
} from "@web/booking/setup/setup-steps";
import { describe, expect, it } from "bun:test";

describe("visibleSetupSteps", () => {
  it("includes destination for zero or two or more writable calendars", () => {
    expect(visibleSetupSteps(0)).toEqual([
      "address",
      "hours",
      "duration",
      "destination",
      "live",
    ]);
    expect(visibleSetupSteps(2)).toEqual([
      "address",
      "hours",
      "duration",
      "destination",
      "live",
    ]);
  });

  it("omits destination for exactly one writable calendar", () => {
    expect(visibleSetupSteps(1)).toEqual([
      "address",
      "hours",
      "duration",
      "live",
    ]);
  });
});

describe("setupStepSentence", () => {
  it("uses the connect prompt copy on destination with zero writable calendars", () => {
    expect(setupStepSentence("destination", 0)).toBe(
      "Connect a calendar you can write to before going live.",
    );
    expect(setupStepSentence("destination", 1)).toBe(
      "New meetings you accept are added to this calendar.",
    );
  });
});

describe("nextSetupStep", () => {
  it("advances through visible steps and clamps at the end", () => {
    expect(nextSetupStep("address", 1)).toBe("hours");
    expect(nextSetupStep("hours", 1)).toBe("duration");
    expect(nextSetupStep("duration", 1)).toBe("live");
    expect(nextSetupStep("live", 1)).toBeNull();
  });

  it("includes destination when multiple writable calendars exist", () => {
    expect(nextSetupStep("duration", 2)).toBe("destination");
    expect(nextSetupStep("destination", 2)).toBe("live");
    expect(nextSetupStep("live", 2)).toBeNull();
  });

  it("includes destination when no writable calendars exist", () => {
    expect(nextSetupStep("duration", 0)).toBe("destination");
    expect(nextSetupStep("destination", 0)).toBe("live");
  });
});

describe("prevSetupStep", () => {
  it("steps back through visible steps and clamps at the start", () => {
    expect(prevSetupStep("address", 1)).toBeNull();
    expect(prevSetupStep("hours", 1)).toBe("address");
    expect(prevSetupStep("duration", 1)).toBe("hours");
    expect(prevSetupStep("live", 1)).toBe("duration");
  });

  it("includes destination when multiple writable calendars exist", () => {
    expect(prevSetupStep("live", 2)).toBe("destination");
    expect(prevSetupStep("destination", 2)).toBe("duration");
  });

  it("includes destination when no writable calendars exist", () => {
    expect(prevSetupStep("live", 0)).toBe("destination");
    expect(prevSetupStep("destination", 0)).toBe("duration");
  });
});

describe("setupStepProgress", () => {
  it("reports step numbers against the visible list", () => {
    expect(setupStepProgress("address", 1)).toEqual({ current: 1, total: 4 });
    expect(setupStepProgress("live", 2)).toEqual({ current: 5, total: 5 });
    expect(setupStepProgress("duration", 2)).toEqual({ current: 3, total: 5 });
    expect(setupStepProgress("destination", 0)).toEqual({
      current: 4,
      total: 5,
    });
  });
});
