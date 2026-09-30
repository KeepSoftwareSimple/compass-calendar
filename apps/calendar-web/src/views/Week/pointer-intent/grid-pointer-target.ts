import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import {
  DATA_TIMED_GRID_ROW,
  ID_ALLDAY_COLUMNS,
  ID_GRID_ALLDAY_ROW,
  ID_GRID_COLUMNS_TIMED,
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_EVENTS_TIMED,
  ID_GRID_MAIN,
} from "@web/common/constants/web.constants";
import { GRID_TIME_STEP } from "@web/grid/grid.constants";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

export const WEEK_EVENT_ID_ATTRIBUTE = "data-week-interaction-event-id";

export type TimedGridPointerIntent = {
  date: string;
  kind: "all-day" | "timed";
  start?: string;
  timeKey?: string;
  timeLabel?: string;
};

const ALL_DAY_GRID_IDS = new Set([
  ID_ALLDAY_COLUMNS,
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_ALLDAY_ROW,
]);

const TIMED_GRID_IDS = new Set([
  ID_GRID_COLUMNS_TIMED,
  ID_GRID_EVENTS_TIMED,
  ID_GRID_MAIN,
]);

const gridKindFromElement = (
  target: HTMLElement,
): TimedGridPointerIntent["kind"] | undefined => {
  if (ALL_DAY_GRID_IDS.has(target.id)) return "all-day";
  if (TIMED_GRID_IDS.has(target.id)) return "timed";
  if (target.hasAttribute(DATA_TIMED_GRID_ROW)) return "timed";
};

export const gridDateFromColumns = (
  kind: TimedGridPointerIntent["kind"],
  clientX: number,
): string | undefined => {
  const columnsRoot = document.getElementById(
    kind === "all-day" ? ID_ALLDAY_COLUMNS : ID_GRID_COLUMNS_TIMED,
  );
  const columns = [
    ...(columnsRoot?.querySelectorAll<HTMLElement>("[data-grid-date]") ?? []),
  ];
  const underPointer = columns.find((column) => {
    const rect = column.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right;
  })?.dataset.gridDate;
  if (underPointer) return underPointer;

  const todayKey = dayjs()
    .tz(getEffectiveTimeZone())
    .format(YEAR_MONTH_DAY_FORMAT);
  return (
    columns.find((column) => column.dataset.gridDate === todayKey)?.dataset
      .gridDate ?? columns[0]?.dataset.gridDate
  );
};

export const timedIntentAt = (
  date: string,
  clientY: number,
): TimedGridPointerIntent | null => {
  const grid = document.getElementById(ID_GRID_MAIN);
  if (!grid) return null;
  const rect = grid.getBoundingClientRect();
  const relative = grid.scrollTop + clientY - rect.top;
  const rawMinute = (relative / grid.scrollHeight) * 1440;
  const minute = Math.min(
    24 * 60 - GRID_TIME_STEP,
    Math.max(0, Math.round(rawMinute / GRID_TIME_STEP) * GRID_TIME_STEP),
  );
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  const hh = String(hour).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const timeKey = `${hh}${mm}`;
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minutes));
  const start = dayjs
    .tz(`${date}T${hh}:${mm}`, getEffectiveTimeZone())
    .format();
  return { date, kind: "timed", start, timeKey, timeLabel };
};

export type GridPointerTarget =
  | { kind: "card"; eventId: string }
  | { kind: "timed-slot"; intent: TimedGridPointerIntent }
  | { kind: "allday-slot"; date: string };

export const eventIdFromPointerTarget = (
  target: EventTarget | null,
): string | undefined => {
  if (!(target instanceof Element)) return undefined;
  const card = target.closest(`[${WEEK_EVENT_ID_ATTRIBUTE}]`);
  if (!(card instanceof HTMLElement)) return undefined;
  const eventId = card.getAttribute(WEEK_EVENT_ID_ATTRIBUTE);
  return eventId && eventId.length > 0 ? eventId : undefined;
};

export const gridPointerTargetFromEvent = (
  event: PointerEvent,
): GridPointerTarget | null => {
  const eventId = eventIdFromPointerTarget(event.target);
  if (eventId) return { kind: "card", eventId };

  const path = event.composedPath();
  let date: string | undefined;
  let kind: TimedGridPointerIntent["kind"] | undefined;
  for (const target of path) {
    if (!(target instanceof HTMLElement)) continue;
    date ??= target.dataset.gridDate;
    kind ??= gridKindFromElement(target);
    if (date && kind) break;
  }
  if (!kind) return null;
  date ??= gridDateFromColumns(kind, event.clientX);
  if (!date) return null;
  if (kind === "all-day") return { kind: "allday-slot", date };
  const intent = timedIntentAt(date, event.clientY);
  return intent ? { kind: "timed-slot", intent } : null;
};
