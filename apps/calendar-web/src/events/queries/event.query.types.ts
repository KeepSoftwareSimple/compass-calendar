import { type NormalizedEvents } from "@web/events/event-view.types";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";

export type NormalizedEventQueryData = NormalizedEvents;

export type EventQueryScope = "day" | "week";

// "day"/"week" entries key on an instant range.
export type EventQueryKeyMetadata = {
  source: EventRepositorySource;
  start: string;
  end: string;
};

export type EventQueryKey = readonly [
  "events",
  EventQueryScope,
  EventQueryKeyMetadata,
];
