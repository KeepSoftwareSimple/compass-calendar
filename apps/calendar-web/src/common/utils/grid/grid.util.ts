import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  GRID_EVENT_TITLE_LINE_HEIGHT_PX,
  GRID_EVENT_TITLE_VERTICAL_SLACK_PX,
  TIMED_VISIBLE_HOURS,
} from "@web/grid/grid.constants";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import {
  AFTER_TMRW_MULTIPLE,
  FLEX_EQUAL,
  FLEX_TMRW,
  FLEX_TODAY,
} from "@web/views/Week/layout.constants";

interface AssignResult {
  fits: boolean;
  rowNum?: number;
}
export const assignEventToRow = (
  eventDays: number[],
  rows: number[][],
): AssignResult => {
  let fits = false;
  let rowNum!: number;

  for (let rowIndex = 0; rowIndex < rows.length; ++rowIndex) {
    const occupiedDays = rows[rowIndex];
    if (_noOverlaps(eventDays, occupiedDays)) {
      fits = true;
      rowNum = rowIndex;
      break;
    }
  }

  return { fits, rowNum };
};

export const getCurrentMinute = () => {
  const now = dayjs().tz(getEffectiveTimeZone());
  return now.get("hours") * 60 + now.get("minutes");
};

// Timed grid always renders exactly TIMED_VISIBLE_HOURS worth of rows in
// whatever height it's given, so this ratio is the single source of truth
// for converting between the grid's pixel geometry and clock minutes.
export const getMinuteHeight = (clientHeight: number) =>
  clientHeight / TIMED_VISIBLE_HOURS / 60;

export const getCurrentPercentOfDay = () => {
  return (getCurrentMinute() / 1440) * 100;
};

// Scrolls the current time to just below the viewport top, not flush with
// it, so the now-line isn't hidden behind the header.
const SCROLL_TO_NOW_BUFFER_PX = 150;

export const getScrollToNowTop = (clientHeight: number) =>
  getCurrentMinute() * getMinuteHeight(clientHeight) - SCROLL_TO_NOW_BUFFER_PX;

// #mainGrid/#allDayRow are <section> elements, not <div>s, so an
// HTMLDivElement-only check made every lookup on them return null and
// silently no-op event listeners (drag never started). Widened to accept
// any element.
export const getElemById = (id: string): HTMLElement | null => {
  const element = document.getElementById(id);

  return element instanceof HTMLElement ? element : null;
};

export const getFlexBasis = (day: Dayjs, week: number, today: Dayjs) => {
  // past/future week
  if (week !== today.week()) return FLEX_EQUAL;

  const todaysWeekNum = today.get("day") + 1;
  const flexBasisByDay = {
    [todaysWeekNum]: FLEX_TODAY,
    [todaysWeekNum + 1]: FLEX_TMRW,
  };

  // today or tmrw
  const thisDaysWeekNum = day.get("day") + 1;
  const flexBasis = flexBasisByDay[thisDaysWeekNum];
  if (flexBasis) return flexBasis;

  const prevDayFlex = getPrevDayWidth(today);
  if (today.isAfter(day)) {
    // previous day
    return prevDayFlex;
  }
  // future day
  return prevDayFlex * AFTER_TMRW_MULTIPLE;
};

export const getLineClamp = (height: number) => {
  const min = 1;
  const computed = Math.round(
    (height - GRID_EVENT_TITLE_VERTICAL_SLACK_PX) /
      GRID_EVENT_TITLE_LINE_HEIGHT_PX,
  );
  const lineClamp = Math.max(min, computed);
  return lineClamp;
};

export const getPrevDayWidth = (today: Dayjs) => {
  const todayWeekNum = today.get("day") + 1;
  const yesterdayDayNum = todayWeekNum - 1;
  const futureDays = 5 - yesterdayDayNum; // 5 cuz exclude today and tmrw
  const futureFactor = futureDays * AFTER_TMRW_MULTIPLE;
  const diff = yesterdayDayNum + futureFactor;
  const width = 60 / diff;

  return width;
};

const normalizeDayNums = (days: number[]) => {
  // doesn't support events longer than 365/6 days
  return days.map((d) => {
    if (d < 365) {
      return d + 365;
    } else {
      return d;
    }
  });
};

const _anySharedValues = (arr1: number[], arr2: number[]) => {
  return arr1.some((v) => arr2.indexOf(v) >= 0);
};

const _noOverlaps = (eventDays: number[], occupiedDays: number[]) => {
  const anyOverlapsThisYear = eventDays.some(
    (day) => occupiedDays.indexOf(day) >= 0,
  );
  if (anyOverlapsThisYear) {
    return false;
  }

  /*
  check for events that go into next year
  */
  const normalizedDays = normalizeDayNums(eventDays);
  const normalizedOccupiedDays = normalizeDayNums(occupiedDays);

  const anyOverlapsNextYear = _anySharedValues(
    normalizedDays,
    normalizedOccupiedDays,
  );

  if (anyOverlapsNextYear) {
    return false;
  }

  return true;
};
