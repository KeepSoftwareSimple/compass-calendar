import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";

export type GridEventShortcutTarget = {
  eventId: string;
  eventType: "all-day" | "timed";
};

export type FocusableGridEventTarget = GridEventShortcutTarget & {
  element: HTMLElement;
};

export const findCalendarEventForTarget = (
  target: GridEventShortcutTarget,
  {
    allDayEvents,
    timedEvents,
  }: { allDayEvents: GridEvent[]; timedEvents: GridEvent[] },
): GridEvent | null => {
  const events = target.eventType === "all-day" ? allDayEvents : timedEvents;
  return events.find((candidate) => candidate._id === target.eventId) ?? null;
};

type TargetSchedule = {
  dayKey: string;
  /** Absolute start for chronological ordering within a day. */
  startMs: number;
  /** Absolute end; exclusive for overlap (`start <= now < end`). */
  endMs: number;
  /**
   * Minutes from local midnight. Cross-day Left/Right pick the event whose
   * clock time is nearest the focused event (not absolute datetime distance).
   */
  minutesFromMidnight: number;
};

const dayKeyFromStart = (startDate: string) =>
  dayjs(startDate).format("YYYY-MM-DD");

const minutesFromMidnight = (startDate: string) => {
  const start = dayjs(startDate);
  return start.hour() * 60 + start.minute();
};

const buildScheduleById = (
  allDayEvents: GridEvent[],
  timedEvents: GridEvent[],
) => {
  const scheduleById = new Map<string, TargetSchedule>();
  for (const event of [...allDayEvents, ...timedEvents]) {
    if (!event._id || !event.startDate) continue;
    const start = dayjs(event.startDate);
    scheduleById.set(event._id, {
      dayKey: dayKeyFromStart(event.startDate),
      startMs: start.valueOf(),
      endMs: event.endDate ? dayjs(event.endDate).valueOf() : start.valueOf(),
      minutesFromMidnight: minutesFromMidnight(event.startDate),
    });
  }
  return scheduleById;
};

const compareTargetsChronologically = (
  a: FocusableGridEventTarget,
  b: FocusableGridEventTarget,
  scheduleById: Map<string, TargetSchedule>,
) => {
  const aStart = scheduleById.get(a.eventId)?.startMs ?? 0;
  const bStart = scheduleById.get(b.eventId)?.startMs ?? 0;
  if (aStart !== bStart) return aStart - bStart;
  if (a.eventType !== b.eventType) {
    return a.eventType === "all-day" ? -1 : 1;
  }
  return a.eventId.localeCompare(b.eventId);
};

const sortVisibleChronologically = (
  visible: FocusableGridEventTarget[],
  scheduleById: Map<string, TargetSchedule>,
) =>
  [...visible].sort((a, b) =>
    compareTargetsChronologically(a, b, scheduleById),
  );

const findFocusedIndex = (
  sorted: FocusableGridEventTarget[],
  focused: GridEventShortcutTarget,
) =>
  sorted.findIndex(
    (target) =>
      target.eventId === focused.eventId &&
      target.eventType === focused.eventType,
  );

/**
 * Order visible grid targets chronologically: earlier start first; on a tie,
 * all-day before timed. Stops at ends (no wrap).
 */
export function getChronologicallyAdjacentTarget({
  allDayEvents,
  direction,
  focused,
  timedEvents,
  visible,
}: {
  allDayEvents: GridEvent[];
  direction: "previous" | "next";
  focused: GridEventShortcutTarget | null;
  timedEvents: GridEvent[];
  visible: FocusableGridEventTarget[];
}): FocusableGridEventTarget | null {
  if (visible.length === 0 || !focused) return null;

  const scheduleById = buildScheduleById(allDayEvents, timedEvents);
  const sorted = sortVisibleChronologically(visible, scheduleById);
  const index = findFocusedIndex(sorted, focused);
  if (index < 0) return null;

  const nextIndex = direction === "previous" ? index - 1 : index + 1;
  return sorted[nextIndex] ?? null;
}

/**
 * Week-view spatial focus: Up/Down stay on the focused day; Left/Right jump to
 * the time-nearest event on the next/previous non-empty day (skip empty days).
 * All-day counts as the first position on its day. No wrap at day or week ends.
 */
export function getSpatiallyAdjacentTarget({
  allDayEvents,
  direction,
  focused,
  timedEvents,
  visible,
  weekDays,
}: {
  allDayEvents: GridEvent[];
  direction: "up" | "down" | "left" | "right";
  focused: GridEventShortcutTarget | null;
  timedEvents: GridEvent[];
  visible: FocusableGridEventTarget[];
  weekDays: Dayjs[];
}): FocusableGridEventTarget | null {
  if (visible.length === 0 || !focused) return null;

  const scheduleById = buildScheduleById(allDayEvents, timedEvents);
  const focusedSchedule = scheduleById.get(focused.eventId);
  if (!focusedSchedule) return null;

  if (direction === "up" || direction === "down") {
    const sameDay = visible.filter(
      (target) =>
        scheduleById.get(target.eventId)?.dayKey === focusedSchedule.dayKey,
    );
    const sorted = sortVisibleChronologically(sameDay, scheduleById);
    const index = findFocusedIndex(sorted, focused);
    if (index < 0) return null;
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    return sorted[nextIndex] ?? null;
  }

  const weekDayKeys = weekDays.map((day) => day.format("YYYY-MM-DD"));
  const occupiedDayKeys = weekDayKeys.filter((dayKey) =>
    visible.some(
      (target) => scheduleById.get(target.eventId)?.dayKey === dayKey,
    ),
  );
  const focusedDayIndex = occupiedDayKeys.indexOf(focusedSchedule.dayKey);
  if (focusedDayIndex < 0) return null;

  const adjacentDayIndex =
    direction === "left" ? focusedDayIndex - 1 : focusedDayIndex + 1;
  const adjacentDayKey = occupiedDayKeys[adjacentDayIndex];
  if (!adjacentDayKey) return null;

  const dayTargets = visible.filter(
    (target) => scheduleById.get(target.eventId)?.dayKey === adjacentDayKey,
  );
  if (dayTargets.length === 0) return null;

  let nearest = dayTargets[0]!;
  let nearestDelta = Number.POSITIVE_INFINITY;
  for (const target of dayTargets) {
    const minutes = scheduleById.get(target.eventId)?.minutesFromMidnight ?? 0;
    const delta = Math.abs(minutes - focusedSchedule.minutesFromMidnight);
    if (delta < nearestDelta) {
      nearest = target;
      nearestDelta = delta;
      continue;
    }
    if (delta > nearestDelta) continue;
    // Tie: prefer all-day, then stable id order.
    if (compareTargetsChronologically(target, nearest, scheduleById) < 0) {
      nearest = target;
    }
  }
  return nearest;
}

/**
 * Seed target when nothing is focused: the most relevant event in the current
 * Day/Week surface relative to `now`. Prefers today when any candidate is
 * today; prefers timed over all-day; then in-progress (soonest end), else
 * next upcoming, else most recently ended.
 */
export function getNearestTargetToNow({
  allDayEvents,
  now = dayjs(),
  timedEvents,
  visible,
}: {
  allDayEvents: GridEvent[];
  now?: Dayjs;
  timedEvents: GridEvent[];
  visible: FocusableGridEventTarget[];
}): FocusableGridEventTarget | null {
  if (visible.length === 0) return null;

  const scheduleById = buildScheduleById(allDayEvents, timedEvents);
  const todayKey = now.format("YYYY-MM-DD");
  const todayVisible = visible.filter(
    (target) => scheduleById.get(target.eventId)?.dayKey === todayKey,
  );
  const inView = todayVisible.length > 0 ? todayVisible : visible;
  const timed = inView.filter((target) => target.eventType === "timed");
  const pool = timed.length > 0 ? timed : inView;

  const nowMs = now.valueOf();
  let best: FocusableGridEventTarget | null = null;
  let bestKind = 3;
  let bestKey = Number.POSITIVE_INFINITY;

  for (const target of pool) {
    const schedule = scheduleById.get(target.eventId);
    if (!schedule) continue;

    const { startMs, endMs } = schedule;
    // 0 overlapping, 1 upcoming, 2 past. Lower kind always wins.
    let kind: 0 | 1 | 2;
    let key: number;
    if (startMs <= nowMs && nowMs < endMs) {
      kind = 0;
      key = endMs;
    } else if (startMs > nowMs) {
      kind = 1;
      key = startMs;
    } else {
      kind = 2;
      key = -endMs;
    }

    if (kind > bestKind) continue;
    if (kind < bestKind || key < bestKey) {
      best = target;
      bestKind = kind;
      bestKey = key;
      continue;
    }
    if (key > bestKey || !best) continue;
    if (compareTargetsChronologically(target, best, scheduleById) < 0) {
      best = target;
    }
  }

  return best;
}
