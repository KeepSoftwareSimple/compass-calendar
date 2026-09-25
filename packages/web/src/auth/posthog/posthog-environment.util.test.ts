import { NodeEnv } from "@core/constants/core.constants";
import { resolvePosthogEnvironment } from "@web/auth/posthog/posthog-environment.util";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { describe, expect, it } from "bun:test";

describe("resolvePosthogEnvironment", () => {
  it("maps the staging hostname to staging", () => {
    expect(resolvePosthogEnvironment("staging.compasscalendar.com")).toBe(
      NodeEnv.Staging,
    );
  });

  it("maps production hostnames to production", () => {
    expect(resolvePosthogEnvironment("compasscalendar.com")).toBe(
      NodeEnv.Production,
    );
    expect(resolvePosthogEnvironment("www.compasscalendar.com")).toBe(
      NodeEnv.Production,
    );
  });

  it("falls back to the Compass runtime env for unknown hosts", () => {
    expect(resolvePosthogEnvironment("localhost")).toBe(ENV_WEB.NODE_ENV);
  });
});
