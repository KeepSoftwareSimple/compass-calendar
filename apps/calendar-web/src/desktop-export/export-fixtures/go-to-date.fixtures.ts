import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import {
  GO_TO_DATE_ANNOUNCEMENT_TARGET_YMD,
  GO_TO_DATE_PARSE_VECTORS,
  GO_TO_DATE_REFERENCE_NOW_ISO,
} from "@core/test/go-to-date.vectors.data";
import dayjs from "@core/util/date/dayjs";
import {
  goToDateAnnouncement,
  goToDatePaletteLabel,
  parseUserDate,
} from "@web/common/utils/datetime/web.date.util";

export const buildGoToDateFixtures = () => {
  const now = dayjs(GO_TO_DATE_REFERENCE_NOW_ISO);
  const target = dayjs(GO_TO_DATE_ANNOUNCEMENT_TARGET_YMD);

  return {
    referenceNow: now.toISOString(),
    cases: [
      ...GO_TO_DATE_PARSE_VECTORS.map(({ input, expectedYmd }) => ({
        id: `parse-${input.replace(/\s+/g, "-")}`,
        input: { text: input, now: now.toISOString() },
        output: {
          expected: expectedYmd,
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
