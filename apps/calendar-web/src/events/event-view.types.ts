import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
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
