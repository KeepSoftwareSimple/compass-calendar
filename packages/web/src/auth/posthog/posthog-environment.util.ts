import { NodeEnv } from "@core/constants/core.constants";
import { ENV_WEB } from "@web/common/constants/env.constants";

const STAGING_HOSTNAME = "staging.compasscalendar.com";
const PRODUCTION_HOSTNAMES = new Set([
  "compasscalendar.com",
  "www.compasscalendar.com",
]);

/**
 * PostHog `environment` super property. Prefer the live hostname when it is a
 * known Compass deploy, so staging traffic stays staging even if an image was
 * built with the wrong runtime.nodeEnv. Falls back to the baked runtime env.
 */
export function resolvePosthogEnvironment(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === STAGING_HOSTNAME) {
      return NodeEnv.Staging;
    }
    if (PRODUCTION_HOSTNAMES.has(hostname)) {
      return NodeEnv.Production;
    }
  }

  return ENV_WEB.NODE_ENV;
}
