export const DRAFT_PADDING_BOTTOM = 3;
export const EVENT_ALLDAY_HEIGHT = 20;
export const EVENT_ALLDAY_GAP = 3;
export const EVENT_ALLDAY_ROW_HEIGHT = EVENT_ALLDAY_HEIGHT + EVENT_ALLDAY_GAP;
export const EVENT_PADDING_RIGHT = 10;
export const TIMED_EVENT_COLUMN_INSET = 5;
export const GRID_EVENT_TIME_LABEL_FONT_SIZE = "11px";
// Dims the time label relative to the title. Kept high enough that the label,
// composited over the event fill, still clears 4.5:1 with the dark title color.
export const GRID_EVENT_TIME_LABEL_OPACITY = "0.82";
// Line box the 11px time label occupies. The title's line clamp subtracts this
// so the label keeps its row instead of being pushed past the card's clipped edge.
export const GRID_EVENT_TIME_LABEL_LINE_HEIGHT = 13;
// Numeric line-height getLineClamp divides by to convert a card's remaining
// pixel height into a clamp line count. Only reflects the normal-height
// title; getLineClamp doesn't special-case the shorter compact line-height
// below, which predates this constant.
export const GRID_EVENT_TITLE_LINE_HEIGHT_PX = 16;
export const GRID_EVENT_TITLE_LINE_HEIGHT = `${GRID_EVENT_TITLE_LINE_HEIGHT_PX}px`;
export const GRID_EVENT_TITLE_FONT_SIZE = "13px";
// Vertical padding/slack getLineClamp reserves around the title text block.
export const GRID_EVENT_TITLE_VERTICAL_SLACK_PX = 7;
// Below this height the card only has room for a single cramped line.
export const COMPACT_EVENT_MAX_HEIGHT = 15;
export const GRID_EVENT_TITLE_COMPACT_FONT_SIZE = "10px";
export const GRID_EVENT_TITLE_COMPACT_LINE_HEIGHT = "1.1";
export const MIN_EVENT_HEIGHT_FOR_TIME_LABEL = 36;
export const MIN_EVENT_WIDTH_FOR_TIME_LABEL = 90;
export const EVENT_WIDTH_MINIMUM = 80;
// Narrowest a day column can get before the week view drops a day instead;
// wider than EVENT_WIDTH_MINIMUM so titles/time labels stay legible.
export const DAY_COLUMN_MIN_USABLE_WIDTH = 140;
// Overlap deck: events starting within this window share the row side by
// side; a later start is drawn over the earlier card, indented by the ratio.
export const DECK_NEAR_START_MINUTES = 30;
export const DECK_CASCADE_INDENT_RATIO = 0.15;
export const TIMED_EVENT_WIDTH_RATIO = 0.6;
export const TIMED_EVENT_MIN_WIDTH = 280;
export const HIDDEN_EVENT_STRIP_WIDTH = 8;

export function applyHiddenEventStripWidth<T extends { width: number }>(
  position: T,
  isHidden: boolean,
): T {
  return isHidden ? { ...position, width: HIDDEN_EVENT_STRIP_WIDTH } : position;
}
export const GRID_PADDING_BOTTOM = 20;
export const GRID_TIME_COLUMN_WIDTH = 50;
export const GRID_MARGIN_LEFT = GRID_TIME_COLUMN_WIDTH;

export function gridMarginLeftFor(hasSecondaryTimeZone: boolean): number {
  return hasSecondaryTimeZone
    ? GRID_TIME_COLUMN_WIDTH * 2
    : GRID_TIME_COLUMN_WIDTH;
}
export const GRID_TIME_STEP = 15;
export const TIMED_VISIBLE_HOURS = 13;
/** Minutes from the timed track origin (1 AM civil time). */
export function minutesFromTimedTrackOrigin(
  minutesFromCivilMidnight: number,
): number {
  return Math.max(0, minutesFromCivilMidnight - 60);
}

/** Pixel top inside the timed track (1 AM origin). */
export function timedGridTopPx(
  minutesFromCivilMidnight: number,
  hourHeight: number,
): number {
  return (
    (minutesFromTimedTrackOrigin(minutesFromCivilMidnight) / 60) * hourHeight
  );
}

/** Vertical position inside the 13-hour timed track (percent of track height). */
export function timedGridTopPercent(minutesFromCivilMidnight: number): number {
  return (
    (minutesFromTimedTrackOrigin(minutesFromCivilMidnight) /
      60 /
      TIMED_VISIBLE_HOURS) *
    100
  );
}

/** Horizontal offset inside the timed track (after the gutter margin). */
export function timedTrackLeftPx(
  columnLeft: number,
  inset: number = TIMED_EVENT_COLUMN_INSET,
): number {
  return columnLeft + inset;
}
// One timed-grid hour. 100% is the viewport-tall parent (h-full), so each
// slot is viewport / TIMED_VISIBLE_HOURS — the same basis events and hour
// lines use. Do not put this on a 23-hour-tall parent.
export const TIMED_HOUR_SLOT_HEIGHT_CLASS =
  "h-[calc(100%/var(--calendar-visible-hours))]";
