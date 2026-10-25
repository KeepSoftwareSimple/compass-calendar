import {
  CIVIL_DAY_DENVER,
  CIVIL_DAY_DST_LENGTH_CASES,
  CIVIL_DAY_GRID_MINUTES_CASES,
  CIVIL_DAY_US_FALL_BACK_YMD,
  CIVIL_DAY_US_SPRING_FORWARD_YMD,
} from "@core/test/civil-day.vectors.data";
import {
  civilDayLengthMinutes,
  civilHourLineInstants,
  civilHourSlotCount,
  formatInstantInTimeZone,
  gridMinutesFromCivilMidnight,
  maxCivilHourSlotCount,
  minutesFromCivilMidnight,
  startOfCivilDay,
} from "./civil-day";
import { describe, expect, it } from "bun:test";

describe("civilDayLengthMinutes", () => {
  it.each(CIVIL_DAY_DST_LENGTH_CASES)(
    "counts $lengthMinutes minutes on $day in $zone",
    ({ day, zone, lengthMinutes, slotCount }) => {
      expect(civilDayLengthMinutes(day, zone)).toBe(lengthMinutes);
      expect(civilHourSlotCount(day, zone)).toBe(slotCount);
    },
  );

  it("counts 1440 minutes on a non-transition day", () => {
    expect(civilDayLengthMinutes("2026-08-20", CIVIL_DAY_DENVER)).toBe(1440);
  });
});

describe("maxCivilHourSlotCount", () => {
  it("uses 25 slots when a US fall-back day is in the range", () => {
    const days = ["2026-10-31", CIVIL_DAY_US_FALL_BACK_YMD, "2026-11-02"];
    expect(maxCivilHourSlotCount(days, CIVIL_DAY_DENVER)).toBe(25);
  });

  it("returns 23 for a spring-forward day and 25 for a fall-back day", () => {
    expect(
      maxCivilHourSlotCount(
        [CIVIL_DAY_US_SPRING_FORWARD_YMD],
        CIVIL_DAY_DENVER,
      ),
    ).toBe(23);
    expect(
      maxCivilHourSlotCount([CIVIL_DAY_US_FALL_BACK_YMD], CIVIL_DAY_DENVER),
    ).toBe(25);
  });
});

describe("gridMinutesFromCivilMidnight", () => {
  it("matches hour labels on spring-forward and fall-back days", () => {
    for (const { instant, zone, minutes } of CIVIL_DAY_GRID_MINUTES_CASES) {
      expect(gridMinutesFromCivilMidnight(instant, zone)).toBe(minutes);
    }
  });
});

describe("minutesFromCivilMidnight", () => {
  it("places 9 AM on the expected minute index regardless of offset suffix", () => {
    expect(
      minutesFromCivilMidnight("2026-11-05T09:00:00-07:00", CIVIL_DAY_DENVER),
    ).toBe(540);
    expect(
      minutesFromCivilMidnight("2026-11-05T16:00:00.000Z", CIVIL_DAY_DENVER),
    ).toBe(540);
  });

  it("separates the two 1:30 AM instants on fall-back day", () => {
    for (const {
      instant,
      zone,
      minutes,
    } of CIVIL_DAY_GRID_MINUTES_CASES.filter(({ instant }) =>
      instant.includes("01:30"),
    )) {
      expect(minutesFromCivilMidnight(instant, zone)).toBe(minutes);
    }
  });
});

describe("startOfCivilDay", () => {
  it("uses the calendar zone for the civil date key, not the host local zone", () => {
    const instant = new Date("2026-10-21T17:00:00.000Z");
    const start = startOfCivilDay(instant, CIVIL_DAY_DENVER);
    expect(start.format("YYYY-MM-DD HH:mm Z")).toBe("2026-10-21 00:00 -06:00");
    const labels = civilHourLineInstants(instant, CIVIL_DAY_DENVER, true)
      .slice(5, 8)
      .map((line) => line.tz(CIVIL_DAY_DENVER).format("h A"));
    expect(labels).toEqual(["6 AM", "7 AM", "8 AM"]);
  });
});

describe("civilHourLineInstants", () => {
  it("walks 1 AM through 11 PM on a non-transition day", () => {
    const lines = civilHourLineInstants("2026-08-20", CIVIL_DAY_DENVER);
    expect(lines).toHaveLength(23);
    expect(lines[0]?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-20 01:00");
    expect(lines.at(-1)?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-20 23:00");
  });

  it("adds the next midnight when includeMidnight is true", () => {
    const lines = civilHourLineInstants("2026-08-20", CIVIL_DAY_DENVER, true);
    expect(lines).toHaveLength(24);
    expect(lines.at(-1)?.format("YYYY-MM-DD HH:mm")).toBe("2026-08-21 00:00");
  });

  it("follows DST slot counts", () => {
    expect(
      civilHourLineInstants(CIVIL_DAY_US_FALL_BACK_YMD, CIVIL_DAY_DENVER, true),
    ).toHaveLength(25);
    expect(
      civilHourLineInstants(
        CIVIL_DAY_US_SPRING_FORWARD_YMD,
        CIVIL_DAY_DENVER,
        true,
      ),
    ).toHaveLength(23);
  });
});

describe("formatInstantInTimeZone", () => {
  it("re-anchors to the zone offset for the civil date", () => {
    const formatted = formatInstantInTimeZone(
      "2026-11-05T16:00:00.000Z",
      CIVIL_DAY_DENVER,
    );
    expect(formatted).toBe("2026-11-05T09:00:00-07:00");
  });
});
