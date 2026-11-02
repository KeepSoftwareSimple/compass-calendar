import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import { gridOverlapIntervalEnd } from "@core/util/date/grid-overlap-interval";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  EMPTY_HIDDEN_EVENT_IDS,
  isEventIdHidden,
} from "@web/events/hidden/hidden-event-id";
import {
  applyHiddenEventStripWidth,
  DECK_CASCADE_INDENT_RATIO,
  DECK_NEAR_START_MINUTES,
  TIMED_EVENT_MIN_WIDTH,
  TIMED_EVENT_WIDTH_RATIO,
} from "@web/grid/grid.constants";
import { type EventPosition } from "@web/grid/types/grid.types";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { parseGridScheduleDate } from "@web/timezone/parse-grid-schedule-date";

/**
 * Where an overlapping card sits inside its column. `left` and `width` are
 * fractions of the usable column width so the same layout serves any column
 * size; `zIndex` is paint order within the group (later starts on top) and
 * `groupSize` lets a selected card be raised above every partner.
 */
export interface TimedDeckLayout {
  groupSize: number;
  left: number;
  width: number;
  zIndex: number;
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

interface PlacedCard {
  candidate: DeckCandidate;
  left: number;
  width: number;
}

/**
 * Lays out overlapping timed cards the way Google Calendar does: events that
 * start within {@link DECK_NEAR_START_MINUTES} of each other share the row
 * side by side; an event that starts later than that on top of an earlier
 * one is drawn over it, indented, so the earlier title stays readable above.
 */
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
      placeGroup(orderBackgroundFirst(group));
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

  if (!deckLayout) {
    return { ...position, width: getTimedEventCardWidth(position.width) };
  }

  return {
    ...position,
    left: position.left + deckLayout.left * position.width,
    width: deckLayout.width * position.width,
    zIndex: deckLayout.zIndex,
  };
};

/** Raise a deck card above overlap partners without changing its slot. */
export const elevateTimedDeckZIndex = (
  deckLayout: TimedDeckLayout,
  zIndex: number,
): number => Math.max(zIndex, deckLayout.groupSize + deckLayout.zIndex);

export const timedDeckBoxShadow = (isFocused: boolean): string => {
  const ring = "0 0 0 0.75px var(--background)";
  const drop = isFocused
    ? "0 6px 14px -3px rgba(0,0,0,0.55)"
    : "0 3px 6px -2px rgba(0,0,0,0.4)";
  const highlight = `inset 0 1px 0 rgba(255,255,255,${isFocused ? 0.1 : 0.07})`;
  return `${ring}, ${drop}, ${highlight}`;
};

const placeGroup = (sorted: DeckCandidate[]) => {
  const placed: PlacedCard[] = [];

  for (let index = 0; index < sorted.length; ) {
    const batch = takeBatch(sorted, index);
    const [left, right] = batchSpan(batch, placed);
    const width = (right - left) / batch.length;

    batch.forEach((candidate, slot) => {
      const card = { candidate, left: left + slot * width, width };
      placed.push(card);
      candidate.item.deckLayout = {
        groupSize: sorted.length,
        left: card.left,
        width,
        zIndex: placed.length,
      };
    });

    index += batch.length;
  }
};

/** Consecutive sorted events that start close to the first and overlap it. */
const takeBatch = (sorted: DeckCandidate[], from: number): DeckCandidate[] => {
  const batch = [sorted[from]];
  for (let next = from + 1; next < sorted.length; next++) {
    const candidate = sorted[next];
    const startsNear = isNearStart(sorted[from], candidate);
    if (!startsNear || !batch.some((member) => overlaps(member, candidate))) {
      break;
    }
    batch.push(candidate);
  }
  return batch;
};

/**
 * Horizontal span for a batch as [left, right) fractions. Cards that started
 * well before the batch are cascaded over (left moves in by the indent);
 * cards that started near the batch must not be covered, so the batch takes
 * the free space beside them.
 */
const batchSpan = (
  batch: DeckCandidate[],
  placed: PlacedCard[],
): [number, number] => {
  const first = batch[0];
  const touching = placed.filter((card) =>
    batch.some((member) => overlaps(member, card.candidate)),
  );
  const far = touching.filter((card) => !isNearStart(card.candidate, first));
  const near = touching.filter((card) => isNearStart(card.candidate, first));

  const left = far.reduce(
    (edge, card) => Math.max(edge, card.left + DECK_CASCADE_INDENT_RATIO),
    0,
  );
  if (near.length === 0) return [left, 1];

  const nearLeft = Math.min(...near.map((card) => card.left));
  if (nearLeft > left) return [left, nearLeft];

  const nearRight = Math.max(...near.map((card) => card.left + card.width));
  if (nearRight < 1) return [nearRight, 1];

  return [left, 1];
};

const isNearStart = (earlier: DeckCandidate, later: DeckCandidate): boolean =>
  later.start.diff(earlier.start, "minute") < DECK_NEAR_START_MINUTES;

const getTimedEventCardWidth = (availableWidth: number) => {
  const fluidWidth = availableWidth * TIMED_EVENT_WIDTH_RATIO;
  // Scale proportionally with the column (no upper cap) so cards track the
  // grid width when the day-view column is resized. The floor keeps cards
  // readable; the final min prevents overflowing a narrow week column.
  const boundedWidth = Math.max(TIMED_EVENT_MIN_WIDTH, fluidWidth);

  return Math.min(availableWidth, boundedWidth);
};

const toDeckCandidate = (item: TimedEventLayoutItem): DeckCandidate => {
  const calendarZone = getEffectiveTimeZone();
  const eventZone = item.event.timeZone ?? calendarZone;
  const start = parseGridScheduleDate(item.event.startDate, eventZone);
  const end = gridOverlapIntervalEnd(
    start,
    parseGridScheduleDate(item.event.endDate, eventZone),
  );

  return {
    dayKey: start.tz(calendarZone).format(YEAR_MONTH_DAY_FORMAT),
    end,
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
