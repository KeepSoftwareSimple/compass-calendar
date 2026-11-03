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
import { buildGoToDateFixtures } from "@web/desktop-export/export-fixtures/go-to-date.fixtures";
import { describe, expect, it } from "bun:test";

const ymd = (value: ReturnType<typeof parseUserDate>) =>
  value?.format(YEAR_MONTH_DAY_FORMAT) ?? null;

describe("go-to-date desktop vectors", () => {
  it("matches shared parse vectors at the reference now", () => {
    const now = dayjs(GO_TO_DATE_REFERENCE_NOW_ISO);
    for (const { input, expectedYmd } of GO_TO_DATE_PARSE_VECTORS) {
      expect(ymd(parseUserDate(input, now))).toBe(expectedYmd);
    }
  });

  it("matches announcement strings for the shared target date", () => {
    const target = dayjs(GO_TO_DATE_ANNOUNCEMENT_TARGET_YMD);
    const announcements = buildGoToDateFixtures().cases.find(
      (vectorCase) => vectorCase.id === "announcements",
    );
    expect(announcements?.output).toEqual({
      paletteLabel: goToDatePaletteLabel(target),
      day: goToDateAnnouncement(target, "day"),
      week: goToDateAnnouncement(target, "week"),
      life: goToDateAnnouncement(target, "life"),
    });
  });
});
