import { startOtelLogs, stopOtelLogs } from "@core/logger/otel-logs";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { CONFIG } from "@backend/common/constants/config.constants";

export function startPostHogLogs(): void {
  startOtelLogs({
    serviceName: "compass-backend",
    nodeEnv: CONFIG.NODE_ENV,
    posthogKey: CONFIG.POSTHOG_KEY,
    posthogHost: CONFIG.POSTHOG_HOST,
    version: normalizeDeployVersion(CONFIG.VERSION),
  });
}

export async function stopPostHogLogs(): Promise<void> {
  await stopOtelLogs();
}
