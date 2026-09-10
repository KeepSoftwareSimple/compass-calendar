/**
 * Normalizes the deploy revision exposed on `/api/config`, sync readiness,
 * and PostHog `version` properties (release tag without a leading `v`, or a
 * build SHA / compass.yaml runtime.version string).
 */
export function normalizeDeployVersion(
  version: string | number | null | undefined,
): string {
  if (version === null || version === undefined) {
    return "dev";
  }
  const trimmed = String(version).trim();
  if (trimmed === "") {
    return "dev";
  }
  return trimmed.replace(/^v/, "");
}
