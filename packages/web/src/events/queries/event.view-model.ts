import { Origin } from "@core/constants/core.constants";
import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { withColor, withColorHex } from "@core/types/event-color.contracts";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";
import {
  shouldRenderTimedInAllDayRow,
  timedMultiDayToAllDayDates,
} from "@web/common/utils/event/event-nudge.util";
import { assignEventsToRow } from "@web/common/utils/grid/assign.row";
import { gridRecurrenceFromEvent } from "@web/events/grid-event-recurrence";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";
import { type NormalizedEventQueryData } from "./event.query.types";

// The ONE authoritative spot for a busy event's display title (packet 08
// step 8, A18): the server never sends a busy event's real title/description
// (content is just `{ kind: "busy" }`), so this is a synthetic label for
// rendering only - never real content. Cards (below) and the read-only
// form's title position (EventForm.tsx) both read this constant rather than
// each hand-rolling the same fallback; a draft's actual editable `title`
// value (grid-event-draft.adapter.ts) stays "" for a busy source, since
// there's nothing real to duplicate/resubmit.
export const BUSY_EVENT_TITLE = "Busy";

// The per-event annotations stamped on NormalizedEventQueryData that this
// view model joins onto each GridEvent (demoEventIds -> isDemo,
// duplicateCopies -> otherCopies).
type EventAnnotations = Pick<
  NormalizedEventQueryData,
  "demoEventIds" | "duplicateCopies"
>;

type EventToGridEventOptions = EventAnnotations & {
  /** Override schedule dates / all-day for multi-day timed display promotion. */
  scheduleOverride?: {
    isAllDay: boolean;
    startDate: string;
    endDate: string;
    isTimedMultiDayDisplay?: boolean;
  };
};

/**
 * Direct Event → GridEvent assembly for the calendar view-model hot path.
 * Avoids the Event → CompassEvent → GridEvent bridge and joins calendar
 * metadata (calendarId / isBusy / color / isDemo) inline.
 */
const eventToGridEvent = (
  event: Event,
  {
    demoEventIds,
    duplicateCopies,
    scheduleOverride,
  }: EventToGridEventOptions = {},
): GridEvent => {
  const { schedule } = event;
  const isAllDay = scheduleOverride?.isAllDay ?? schedule.kind === "allDay";
  const startDate = scheduleOverride?.startDate ?? schedule.start;
  const endDate = scheduleOverride?.endDate ?? schedule.end;
  const isBusy = event.content.kind === "busy";
  const isProviderManaged = event.providerManaged === true;
  const details = event.content.kind === "details" ? event.content : undefined;

  return {
    _id: event.id,
    title: details?.title ?? BUSY_EVENT_TITLE,
    description: details?.description ?? "",
    origin: Origin.COMPASS,
    user: "",
    isAllDay,
    startDate,
    endDate,
    recurrence: gridRecurrenceFromEvent(event),
    updatedAt: event.updatedAt ?? undefined,
    position: gridEventDefaultPosition,
    calendarId: event.calendarId,
    isBusy,
    ...(isProviderManaged ? { isProviderManaged: true as const } : {}),
    isDemo: Boolean(demoEventIds?.includes(event.id)),
    ...(duplicateCopies?.has(event.id)
      ? { otherCopies: duplicateCopies.get(event.id) }
      : {}),
    ...(scheduleOverride?.isTimedMultiDayDisplay
      ? { isTimedMultiDayDisplay: true }
      : {}),
    ...withColor(details?.color ?? undefined),
    ...withColorHex(details?.colorHex),
    location: details?.location,
    organizer: details?.organizer,
    attendees: details?.attendees,
    conference: details?.conference,
  };
};

const eventsFrom = (data?: NormalizedEventQueryData): Event[] =>
  data?.ids.flatMap((id) => (data.entities[id] ? [data.entities[id]] : [])) ??
  [];

// A cache entry with a missing/malformed `schedule` is a bug upstream
// (normalizeEventList/query seeding), not a case to silently swallow — but
// it must not crash this shared derivation, since every grid consumer
// recomputes from it on every render (a throw here becomes a render-crash
// loop). Log loudly and drop the offending event instead.
const isValidScheduledEvent = (event: Event): boolean => {
  const isValid =
    event.schedule != null && typeof event.schedule.kind === "string";
  if (!isValid) {
    console.error(
      `[event.view-model] dropping event ${event.id ?? "(no id)"} with malformed schedule`,
      event,
    );
  }
  return isValid;
};

// A series base is metadata-only: its schedule is the first occurrence's
// datetime (kept so the RRULE and series id are reachable for editing), but
// the first occurrence itself is a separately materialized doc that renders
// the actual card. Rendering the base too would double the first day.
const scheduledNonSeries = (events: Event[]) =>
  events
    .filter(isValidScheduledEvent)
    .filter((event) => event.recurrence.kind !== "series");

const gridEventsFrom = (
  events: Event[],
  kind: "timed" | "allDay",
  annotations?: EventAnnotations,
) =>
  scheduledNonSeries(events)
    .filter((event) => event.schedule.kind === kind)
    .map((event) => eventToGridEvent(event, { ...annotations }));

const timedEventsFrom = (events: Event[], annotations?: EventAnnotations) =>
  gridEventsFrom(events, "timed", annotations).filter((event) => {
    if (!event.startDate || !event.endDate) return true;
    return !shouldRenderTimedInAllDayRow(
      inEffectiveTimeZone(event.startDate),
      inEffectiveTimeZone(event.endDate),
    );
  });

const multiDayTimedAsAllDayFrom = (
  events: Event[],
  annotations?: EventAnnotations,
): GridEvent[] =>
  scheduledNonSeries(events)
    .filter((event) => event.schedule.kind === "timed")
    .filter((event) => {
      const { start, end } = event.schedule;
      return shouldRenderTimedInAllDayRow(
        inEffectiveTimeZone(start),
        inEffectiveTimeZone(end),
      );
    })
    .map((event) => {
      const { start, end } = event.schedule;
      const dates = timedMultiDayToAllDayDates(
        inEffectiveTimeZone(start),
        inEffectiveTimeZone(end),
      );
      return eventToGridEvent(event, {
        ...annotations,
        scheduleOverride: {
          isAllDay: true,
          startDate: dates.startDate,
          endDate: dates.endDate,
          isTimedMultiDayDisplay: true,
        },
      });
    });

const allDayEventsFrom = (events: Event[], annotations?: EventAnnotations) =>
  assignEventsToRow([
    ...gridEventsFrom(events, "allDay", annotations),
    ...multiDayTimedAsAllDayFrom(events, annotations),
  ]).allDayEvents;

const rowCountFrom = (events: GridEvent[]) => {
  const rows = events
    .map(({ row }) => row)
    .filter((row): row is number => row !== undefined);
  return rows.length === 0 ? 1 : Math.max(...rows);
};

export type CalendarEventViewModel = {
  entities: NormalizedEventQueryData["entities"];
  events: Event[];
  timedEvents: GridEvent[];
  allDayEvents: GridEvent[];
  rowCount: number;
  demoEventIds?: readonly EventId[];
};

/**
 * Assemble the grid arrays. Pure: useCalendarEventViewModel memoizes the whole
 * pipeline this ends, so there is nothing to cache here - only the empty case
 * keeps a shared constant, so a view with no data doesn't hand its consumers a
 * fresh object every render.
 */
export const deriveCalendarEventViewModel = (
  data?: NormalizedEventQueryData,
): CalendarEventViewModel =>
  data ? computeCalendarEventViewModel(data) : EMPTY_CALENDAR_VIEW_MODEL;

const computeCalendarEventViewModel = (
  data?: NormalizedEventQueryData,
): CalendarEventViewModel => {
  const events = eventsFrom(data);
  const demoEventIds = data?.demoEventIds;
  const annotations: EventAnnotations = {
    demoEventIds,
    duplicateCopies: data?.duplicateCopies,
  };
  const timedEvents = timedEventsFrom(events, annotations);
  const allDayEvents = allDayEventsFrom(events, annotations);
  return {
    entities: data?.entities ?? {},
    events,
    timedEvents,
    allDayEvents,
    rowCount: rowCountFrom(allDayEvents),
    demoEventIds,
  };
};

const EMPTY_CALENDAR_VIEW_MODEL = computeCalendarEventViewModel(undefined);
