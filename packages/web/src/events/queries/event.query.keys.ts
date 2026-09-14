import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";

export const eventQueryKeys = {
  all: ["events"] as const,
  /**
   * Prefix builder for scoped invalidation/removal. Matches every cached entry
   * for a read scope regardless of source/params, e.g. `scope("week")` →
   * `["events", "week"]`.
   */
  scope: (scope: "day" | "week") => [...eventQueryKeys.all, scope] as const,
  day: (args: { source: EventRepositorySource; start: string; end: string }) =>
    [
      ...eventQueryKeys.all,
      "day",
      {
        source: args.source,
        start: args.start,
        end: args.end,
      },
    ] as const,
  week: (args: { source: EventRepositorySource; start: string; end: string }) =>
    [
      ...eventQueryKeys.all,
      "week",
      {
        source: args.source,
        start: args.start,
        end: args.end,
      },
    ] as const,
};
