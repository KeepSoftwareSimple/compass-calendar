import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import {
  goToDateAnnouncement,
  goToDatePaletteLabel,
  parseUserDate,
} from "@web/common/utils/datetime/web.date.util";

export const buildGoToDateFixtures = () => {
  const now = dayjs("2026-09-15T12:00:00.000Z");
  const parsedCases = [
    ["2026-10-03", "2026-10-03"],
    ["10/3", "2026-10-03"],
    ["oct 3", "2026-10-03"],
    ["jan 3", "2027-01-03"],
    ["hello", null],
  ] as const;

  const target = dayjs("2026-10-03");

  return {
    referenceNow: now.toISOString(),
    cases: [
      ...parsedCases.map(([input, expected]) => ({
        id: `parse-${input.replace(/\s+/g, "-")}`,
        input: { text: input, now: now.toISOString() },
        output: {
          expected,
          parsed:
            parseUserDate(input, now)?.format(YEAR_MONTH_DAY_FORMAT) ?? null,
        },
      })),
      {
        id: "announcements",
        input: { date: target.format(YEAR_MONTH_DAY_FORMAT) },
        output: {
          paletteLabel: goToDatePaletteLabel(target),
          day: goToDateAnnouncement(target, "day"),
          week: goToDateAnnouncement(target, "week"),
          life: goToDateAnnouncement(target, "life"),
        },
      },
    ],
  };
};

export const emitGoToDateFixturesJson = (): string =>
  `${JSON.stringify(buildGoToDateFixtures(), null, 2)}\n`;
