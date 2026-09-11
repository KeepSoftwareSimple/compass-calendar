import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  EMPTY_HIDDEN_EVENT_IDS,
  isEventIdHidden,
} from "@web/events/hidden/hidden-event-id";
import {
  applyHiddenEventStripWidth,
  DECK_INDENT,
  DECK_MIN_WIDTH,
  DECK_RIGHT_RESERVE,
  TIMED_EVENT_FAN_GUTTER,
  TIMED_EVENT_FAN_INDENT,
  TIMED_EVENT_MIN_WIDTH,
  TIMED_EVENT_WIDTH_RATIO,
} from "@web/grid/grid.constants";
import { type EventPosition } from "@web/grid/types/grid.types";

export interface TimedDeckLayout {
  groupSize: number;
  order: number;
}

export interface TimedEventLayoutItem {
  deckLayout: TimedDeckLayout | null;
  event: GridEvent;
  isHidden: boolean;
}

interface DeckCandidate {
  dayKey: string;
  end: Dayjs;
  item: TimedEventLayoutItem;
  start: Dayjs;
}

export const createTimedEventLayout = (
  events: GridEvent[],
  hiddenEventIds: ReadonlySet<string> = EMPTY_HIDDEN_EVENT_IDS,
): TimedEventLayoutItem[] => {
  const items: TimedEventLayoutItem[] = events.map((event) => ({
    deckLayout: null,
    event,
    isHidden: isEventIdHidden(event._id, hiddenEventIds),
  }));
  const candidates = items
    .filter((item) => !item.isHidden)
    .map(toDeckCandidate);

  for (const dayBucket of bucketByStartDay(candidates)) {
    for (const group of groupByOverlap(dayBucket)) {
      if (group.length < 2) continue;

      orderBackgroundFirst(group).forEach(({ item }, index) => {
        item.deckLayout = { order: index, groupSize: group.length };
      });
    }
  }

  return items;
};

export const applyTimedEventDisplayPosition = (
  position: EventPosition,
  deckLayout: TimedDeckLayout | null,
  isHidden = false,
): EventPosition => {
  if (isHidden) {
    return applyHiddenEventStripWidth(position, true);
  }

  const cardWidth = getTimedEventCardWidth(position.width);

  if (!deckLayout) {
    return { ...position, width: cardWidth };
  }

  const deckWidth = getTimedEventDeckWidth({
    availableWidth: position.width,
    cardWidth,
    groupSize: deckLayout.groupSize,
  });

  return applyTimedDeckPositionWithIndent(
    { ...position, width: deckWidth },
    deckLayout,
    TIMED_EVENT_FAN_INDENT,
  );
};

export const timedDeckBoxShadow = (isFocused: boolean): string => {
  const ring = "0 0 0 0.75px var(--background)";
  const drop = isFocused
    ? "0 6px 14px -3px rgba(0,0,0,0.55)"
    : "0 3px 6px -2px rgba(0,0,0,0.4)";
  const highlight = `inset 0 1px 0 rgba(255,255,255,${isFocused ? 0.1 : 0.07})`;
  return `${ring}, ${drop}, ${highlight}`;
};

export const applyTimedDeckPosition = (
  position: EventPosition,
  deckLayout: TimedDeckLayout,
): EventPosition =>
  applyTimedDeckPositionWithIndent(position, deckLayout, DECK_INDENT);

const applyTimedDeckPositionWithIndent = (
  position: EventPosition,
  deckLayout: TimedDeckLayout,
  indentMax: number,
): EventPosition => {
  const indent = getDeckIndent(position.width, deckLayout.groupSize, indentMax);
  const maxIndent = (deckLayout.groupSize - 1) * indent;
  const fanned = position.width - DECK_RIGHT_RESERVE - maxIndent;
  const maxWidthWithinColumn = Math.max(0, position.width - maxIndent);
  const width = Math.min(
    Math.max(DECK_MIN_WIDTH, fanned),
    maxWidthWithinColumn,
  );

  return {
    ...position,
    left: position.left + deckLayout.order * indent,
    width,
    zIndex: deckLayout.order + 1,
  };
};

const getTimedEventCardWidth = (availableWidth: number) => {
  const fluidWidth = availableWidth * TIMED_EVENT_WIDTH_RATIO;
  // Scale proportionally with the column (no upper cap) so cards track the
  // grid width when the day-view column is resized. The floor keeps cards
  // readable; the final min prevents overflowing a narrow week column.
  const boundedWidth = Math.max(TIMED_EVENT_MIN_WIDTH, fluidWidth);

  return Math.min(availableWidth, boundedWidth);
};

const getTimedEventDeckWidth = ({
  availableWidth,
  cardWidth,
  groupSize,
}: {
  availableWidth: number;
  cardWidth: number;
  groupSize: number;
}) => {
  const extraIndent = Math.max(0, TIMED_EVENT_FAN_INDENT - DECK_INDENT);
  const spreadWidth = cardWidth + (groupSize - 1) * extraIndent;
  const gutteredWidth = Math.max(
    cardWidth,
    availableWidth - TIMED_EVENT_FAN_GUTTER,
  );

  return Math.min(availableWidth, spreadWidth, gutteredWidth);
};

const getDeckIndent = (
  width: number,
  groupSize: number,
  indentMax: number = DECK_INDENT,
) => {
  if (groupSize < 2) return 0;

  const minimumVisibleWidth =
    width >= DECK_MIN_WIDTH ? DECK_MIN_WIDTH : width / groupSize;
  const maxIndentForMinWidth = Math.max(0, width - minimumVisibleWidth);

  return Math.min(indentMax, maxIndentForMinWidth / (groupSize - 1));
};

const toDeckCandidate = (item: TimedEventLayoutItem): DeckCandidate => {
  const start = dayjs(item.event.startDate);

  return {
    dayKey: start.format(YEAR_MONTH_DAY_FORMAT),
    end: dayjs(item.event.endDate),
    item,
    start,
  };
};

const bucketByStartDay = (events: DeckCandidate[]): DeckCandidate[][] => {
  const buckets = new Map<string, DeckCandidate[]>();

  for (const event of events) {
    const bucket = buckets.get(event.dayKey);
    if (bucket) {
      bucket.push(event);
    } else {
      buckets.set(event.dayKey, [event]);
    }
  }

  return Array.from(buckets.values());
};

const groupByOverlap = (events: DeckCandidate[]): DeckCandidate[][] => {
  const remaining = [...events];
  const groups: DeckCandidate[][] = [];

  while (remaining.length) {
    const group = [remaining.shift() as DeckCandidate];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (group.some((g) => overlaps(g, remaining[i]))) {
          group.push(remaining.splice(i, 1)[0]);
          grew = true;
        }
      }
    }
    groups.push(group);
  }

  return groups;
};

const overlaps = (a: DeckCandidate, b: DeckCandidate): boolean =>
  a.start.isBefore(b.end) && a.end.isAfter(b.start);

const orderBackgroundFirst = (group: DeckCandidate[]): DeckCandidate[] =>
  [...group].sort((a, b) => {
    const startDiff = a.start.diff(b.start);
    if (startDiff !== 0) return startDiff;
    return b.end.diff(a.end);
  });
