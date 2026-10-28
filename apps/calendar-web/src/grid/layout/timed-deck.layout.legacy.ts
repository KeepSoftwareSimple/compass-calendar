import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  EMPTY_HIDDEN_EVENT_IDS,
  isEventIdHidden,
} from "@web/events/hidden/hidden-event-id";
import { type TimedDeckLayout } from "@web/grid/layout/timed-deck.layout";

interface TimedEventLayoutItem {
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

/** Pre-#4905 deck bucketing (raw dayjs on `startDate`, no event IANA zone). */
export const createTimedEventLayoutPre4905 = (
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
