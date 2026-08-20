export const DRAFT_DURATION_MIN = 30;
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
export const DECK_INDENT = 16;
export const DECK_RIGHT_RESERVE = 24;
export const DECK_MIN_WIDTH = 72;
export const TIMED_EVENT_WIDTH_RATIO = 0.6;
export const TIMED_EVENT_MIN_WIDTH = 280;
export const TIMED_EVENT_FAN_INDENT = 44;
export const TIMED_EVENT_FAN_GUTTER = 120;
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
