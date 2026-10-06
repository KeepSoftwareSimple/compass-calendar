import { ensureDesktopExportEnv } from "@core/desktop/desktop-export-env";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import dayjs from "@core/util/date/dayjs";
import { generateDemoData } from "@web/common/storage/migrations/external/demo-data-seed";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";

export const DEMO_SEED_REFERENCE_NOW = "2026-06-10T15:00:00.000Z";

/** Stable calendar id for exported demo-seed parity (not the browser sentinel). */
export const DEMO_EXPORT_CALENDAR_ID = CalendarIdSchema.parse(
  "507f1f77bcf86cd799439011",
);

export const buildDemoSeedFixtures = () => {
  ensureDesktopExportEnv();
  setPinnedTimeZone("UTC");
  const referenceNow = dayjs(DEMO_SEED_REFERENCE_NOW);
  const demoData = generateDemoData(referenceNow, {
    calendarId: DEMO_EXPORT_CALENDAR_ID,
    createdAt: DEMO_SEED_REFERENCE_NOW,
    deterministicIds: true,
    timeZone: "UTC",
  });

  return {
    referenceNow: referenceNow.toISOString(),
    timeZone: "UTC",
    calendarId: DEMO_EXPORT_CALENDAR_ID,
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
