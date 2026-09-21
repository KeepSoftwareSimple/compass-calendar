import { type CalendarId, type EventId } from "@core/types/domain-primitives";
import { type BusyPeriod, type Event } from "@core/types/event.contracts";
import { type DuplicateCopy } from "@web/common/types/web.event.types";

export type EventEntityMap = Record<EventId, Event>;

export type NormalizedEvents = {
  ids: EventId[];
  entities: EventEntityMap;
  /** Present when events are loaded from local IndexedDB records. */
  demoEventIds?: readonly EventId[];
  /**
   * Surviving event id -> the other calendars that meeting also exists on.
   * Stamped by mergeDuplicateCopies; joined onto GridEvent as `otherCopies`
   * the same way demoEventIds becomes `isDemo`.
   */
  duplicateCopies?: ReadonlyMap<EventId, DuplicateCopy[]>;
};

export type OptimisticEvent = {
  event: Event;
  mutation: {
    id: string;
    state: "creating" | "updating" | "deleting" | "failed";
  };
};

// Layout code consumes GridCalendarItem; mutation code narrows
// CalendarItem.kind === "event" before exposing actions.
export type CalendarItem =
  | { kind: "event"; event: Event }
  | { kind: "busyPeriod"; busyPeriod: BusyPeriod };

export type GridEventLayout = {
  top: number;
  left: number;
  width: number;
  height: number;
  zIndex: number;
  isOverlapping: boolean;
  dragOffset: { x: number; y: number };
};

export type GridCalendarItem = {
  item: CalendarItem;
  layout: GridEventLayout;
};

export type SelectedDateRange = {
  start: Date;
  end: Date;
  kind: "timed" | "allDay";
};

export type CalendarEventIndex = Record<CalendarId, EventId[]>;
