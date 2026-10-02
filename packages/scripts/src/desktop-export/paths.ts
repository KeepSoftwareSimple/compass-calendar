import { join } from "node:path";

export const COMPASS_KIT_GENERATED_DIR = join(
  process.cwd(),
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Generated",
);

export const COMPASS_KIT_RESOURCES_DIR = join(
  process.cwd(),
  "apps/calendar-macos/CompassKit/Sources/CompassKit/Resources",
);

export const COMPASS_KIT_FIXTURES_DIR = join(
  COMPASS_KIT_RESOURCES_DIR,
  "Fixtures",
);

export const INDEX_CSS_PATH = join(
  process.cwd(),
  "apps/calendar-web/src/index.css",
);

export const TRACK_TS_PATH = join(
  process.cwd(),
  "apps/calendar-web/src/auth/posthog/track.ts",
);
