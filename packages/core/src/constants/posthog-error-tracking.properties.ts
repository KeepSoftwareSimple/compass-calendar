/**
 * Custom PostHog `$exception` property keys shared by backend and sync log
 * pipelines. The error-autofix Routine SQL and PostHog MCP triage depend on
 * these exact names staying aligned with emit sites.
 */
export const POSTHOG_ERROR_TRACKING_PROPERTY = {
  environment: "environment",
  service: "service",
  version: "version",
  namespace: "namespace",
  result: "result",
  errorType: "errorType",
} as const;

export type PostHogErrorTrackingPropertyName =
  (typeof POSTHOG_ERROR_TRACKING_PROPERTY)[keyof typeof POSTHOG_ERROR_TRACKING_PROPERTY];

export const POSTHOG_ERROR_TRACKING_PROPERTY_NAMES = Object.values(
  POSTHOG_ERROR_TRACKING_PROPERTY,
) as PostHogErrorTrackingPropertyName[];

/** HogQL column list for error-autofix Step 1 SQL (properties.*). */
export function posthogErrorTrackingSqlPropertyColumns(): string {
  return POSTHOG_ERROR_TRACKING_PROPERTY_NAMES.map(
    (name) => `properties.${name}`,
  ).join(",\n       ");
}
