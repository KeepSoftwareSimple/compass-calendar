import {
  createPostHogCaptureClient,
  DEFAULT_POSTHOG_HOST,
  type PostHogCaptureClient,
} from "@core/logger/posthog-capture";
import { CONFIG } from "@backend/common/constants/config.constants";

/**
 * Stateless HTTP client for server-side PostHog captures. Built per call so
 * CONFIG is read at call time and tests can toggle POSTHOG_KEY through mockEnv.
 */
export function getBackendPostHogClient(): PostHogCaptureClient | null {
  const apiKey = CONFIG.POSTHOG_KEY;
  if (!apiKey) return null;
  return createPostHogCaptureClient({
    apiKey,
    host: CONFIG.POSTHOG_HOST ?? DEFAULT_POSTHOG_HOST,
    lib: "compass-backend",
  });
}
