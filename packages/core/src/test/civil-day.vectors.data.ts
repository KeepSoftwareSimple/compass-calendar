/**
 * Shared US DST civil-day scenarios for `@core/util/date/civil-day` unit tests
 * and web grid DST integration tests.
 */
export const CIVIL_DAY_DENVER = "America/Denver";
export const CIVIL_DAY_NEW_YORK = "America/New_York";

export const CIVIL_DAY_US_FALL_BACK_YMD = "2026-11-01";
export const CIVIL_DAY_US_SPRING_FORWARD_YMD = "2027-03-14";

export const CIVIL_DAY_DST_LENGTH_CASES = [
  {
    day: CIVIL_DAY_US_FALL_BACK_YMD,
    zone: CIVIL_DAY_DENVER,
    lengthMinutes: 1500,
    slotCount: 25,
  },
  {
    day: CIVIL_DAY_US_SPRING_FORWARD_YMD,
    zone: CIVIL_DAY_DENVER,
    lengthMinutes: 1380,
    slotCount: 23,
  },
  {
    day: CIVIL_DAY_US_FALL_BACK_YMD,
    zone: CIVIL_DAY_NEW_YORK,
    lengthMinutes: 1500,
    slotCount: 25,
  },
  {
    day: CIVIL_DAY_US_SPRING_FORWARD_YMD,
    zone: CIVIL_DAY_NEW_YORK,
    lengthMinutes: 1380,
    slotCount: 23,
  },
] as const;

export const CIVIL_DAY_GRID_MINUTES_CASES = [
  {
    instant: "2027-03-14T09:00:00-06:00",
    zone: CIVIL_DAY_DENVER,
    minutes: 540,
  },
  {
    instant: "2026-11-01T01:30:00-06:00",
    zone: CIVIL_DAY_DENVER,
    minutes: 90,
  },
  {
    instant: "2026-11-01T01:30:00-07:00",
    zone: CIVIL_DAY_DENVER,
    minutes: 150,
  },
  {
    instant: "2026-11-01T04:00:00-07:00",
    zone: CIVIL_DAY_DENVER,
    minutes: 240,
  },
] as const;
