// sort-imports-ignore

import { Logger } from "@core/logger/winston.logger";
import { startPostHogLogs } from "./logging/posthog-logs";

startPostHogLogs();

export const logger: ReturnType<typeof Logger> = Logger("app:root");
