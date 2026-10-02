import dayjs from "@core/util/date/dayjs";
import { generateDemoData } from "@web/common/storage/migrations/external/demo-data-seed";
import { getBrowserTimeZone } from "@web/common/utils/datetime/web.date.util";
import { ensureDesktopExportEnv } from "@web/desktop/export-fixtures/ensure-export-env";

export const DEMO_SEED_REFERENCE_NOW = "2026-06-10T15:00:00.000Z";

export const buildDemoSeedFixtures = () => {
  ensureDesktopExportEnv();
  const referenceNow = dayjs(DEMO_SEED_REFERENCE_NOW);
  const demoData = generateDemoData(referenceNow);

  return {
    referenceNow: referenceNow.toISOString(),
    timeZone: getBrowserTimeZone(),
    events: demoData.events.map(({ id, event, isDemo, version }) => ({
      id,
      event,
      isDemo,
      version,
    })),
  };
};

export const emitDemoSeedFixturesJson = (): string =>
  `${JSON.stringify(buildDemoSeedFixtures(), null, 2)}\n`;
