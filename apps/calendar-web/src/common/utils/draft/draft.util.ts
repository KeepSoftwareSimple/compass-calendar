import { type CalendarId, EventIdSchema } from "@core/types/domain-primitives";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_EVENTS_TIMED,
  ID_GRID_MAIN,
} from "@web/common/constants/web.constants";
import { focusCalendarEventElement } from "@web/common/utils/event/event.util";
import { getElemById, getMinuteHeight } from "@web/common/utils/grid/grid.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { roundToNext } from "@web/common/utils/round/round.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import { GRID_TIME_STEP } from "@web/grid/grid.constants";
import { isDraftRenderedInAllDayRow } from "@web/grid/layout/all-day-draft.position";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

// Keeps a newly-timed event off the very top edge of the scrolled-in
// viewport rather than glued flush against it.
const VISIBLE_START_MARGIN_MIN = 30;

/** Timed draft at the current hour on `targetDay`, the day the user is
 * looking at (selected column, focused event, today, or the view anchor). */
export const createTimedDraft = (
  targetDay: Dayjs,
  activity: "createShortcut" | "keyboardPlace",
  calendarId: CalendarId | null = null,
) => {
  const { startDate, endDate } = getDraftTimes(targetDay);

  startTimedDraftAt(startDate, endDate, activity, calendarId);
};

/**
 * Seed and start a timed draft at an already-decided time. Shared by the
 * near-now defaults above and by quick-time create, which picks its own start
 * from a typed digit sequence.
 */
export const startTimedDraftAt = (
  startDate: string,
  endDate: string,
  activity: "createShortcut" | "keyboardPlace",
  calendarId: CalendarId | null = null,
) => {
  // Stable grid identity so place-create can focus the card and Enter can
  // open the live draft without reseeding.
  const clientId = EventIdSchema.parse(createObjectIdString());
  const draft = createGridEventDraft(
    timedGridSchedule(new Date(startDate), new Date(endDate)),
    clientId,
    calendarId,
  );

  draftActions.startGridDraft({ activity, draft });

  // Place-create keeps the form closed; focus the draft card so further
  // Shift+Arrow / Enter operate on the grid event rather than the title.
  if (activity === "keyboardPlace") {
    focusCalendarEventElement(clientId);
  }
};

/**
 * One hour after `start`, clamped to midnight: a draft that crossed into the
 * next day would render in the all-day row (multi-day timed display), which is
 * a surprising place for "create an event" to land. Ending exactly at midnight
 * still counts as inside the day, so the draft stays in the timed grid.
 */
export const timedDraftEnd = (start: Dayjs): Dayjs => {
  const midnightAfterStart = start.add(1, "day").startOf("day");
  const oneHourEnd = start.add(1, "hour");

  return oneHourEnd.isAfter(midnightAfterStart)
    ? midnightAfterStart
    : oneHourEnd;
};

/** One-day all-day draft on `targetDay`; the caller picks the day. */
export const createAlldayDraft = (
  targetDay: Dayjs,
  activity: "createShortcut",
  calendarId: CalendarId | null = null,
) => {
  const start = targetDay.startOf("day");
  // Same stable identity as timed shortcut drafts so save can reuse it as
  // CreateEventInput.id and restore focus to the new card.
  const clientId = EventIdSchema.parse(createObjectIdString());
  const draft = createGridEventDraft(
    {
      kind: "allDay",
      start: start.toDate(),
      end: start.add(1, "day").toDate(),
    },
    clientId,
    calendarId,
  );

  draftActions.startGridDraft({ activity, draft });
};

export const getDraftTimes = (targetDay: Dayjs) => {
  const now = dayjs().tz(getEffectiveTimeZone());
  const currentMinute = now.minute();
  const nextMinuteInterval = roundToNext(currentMinute, GRID_TIME_STEP);

  let start = targetDay
    .startOf("day")
    .hour(now.hour())
    .minute(nextMinuteInterval)
    .second(0);
  // minute(60) overflows into the next hour, and at 23:xx that is the next
  // day. Keep the draft on the selected column, on the last grid slot.
  if (!start.isSame(targetDay, "day")) {
    start = targetDay
      .startOf("day")
      .hour(23)
      .minute(60 - GRID_TIME_STEP)
      .second(0);
  }
  const startDate = start.format();
  const endDate = timedDraftEnd(start).format();

  return { startDate, endDate };
};

// Timed grid only ever shows a fraction of the 24hr day at once, so a
// draft that needs a visible default time (e.g. converting all-day->timed)
// should land inside whatever's currently scrolled into view, not at a
// fixed hour that may be scrolled off-screen. Returns minutes-from-midnight,
// or null when the grid isn't mounted/measurable yet.
export const getVisibleGridStartMinute = (): number | null => {
  const grid = getElemById(ID_GRID_MAIN);
  if (!grid || grid.clientHeight === 0) return null;

  const minuteHeight = getMinuteHeight(grid.clientHeight);
  const visibleStartMinute = grid.scrollTop / minuteHeight;
  const snapped = roundToNext(
    visibleStartMinute + VISIBLE_START_MARGIN_MIN,
    GRID_TIME_STEP,
  );

  return Math.min(Math.max(snapped, 0), 23 * 60);
};

export const getDraftContainer = (draft: GridEventDraft) =>
  isDraftRenderedInAllDayRow(draft)
    ? getElemById(ID_GRID_EVENTS_ALLDAY)
    : getElemById(ID_GRID_EVENTS_TIMED);
