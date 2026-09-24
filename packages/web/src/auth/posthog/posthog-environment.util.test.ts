import { NodeEnv } from "@core/constants/core.constants";
import { resolvePosthogEnvironment } from "@web/auth/posthog/posthog-environment.util";
import { describe, expect, it } from "bun:test";

describe("resolvePosthogEnvironment", () => {
  it("maps the staging hostname to staging", () => {
    const original = globalThis.window;
    globalThis.window = {
      location: { hostname: "staging.compasscalendar.com" },
    } as Window & typeof globalThis;

    try {
      expect(resolvePosthogEnvironment()).toBe(NodeEnv.Staging);
    } finally {
      globalThis.window = original;
    }
  });

  it("maps the production hostname to production", () => {
    const original = globalThis.window;
    globalThis.window = {
      location: { hostname: "compasscalendar.com" },
    } as Window & typeof globalThis;

    try {
      expect(resolvePosthogEnvironment()).toBe(NodeEnv.Production);
    } finally {
      globalThis.window = original;
    }
  });
});
