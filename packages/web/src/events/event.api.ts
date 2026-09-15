import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import {
  type CreateEventInput,
  type EventListQuery,
  EventListResponseSchema,
  EventResponseSchema,
  type ReplaceEventInput,
  type RsvpEventInput,
} from "@core/types/event-command.contracts";
import { BaseApi } from "@web/api/base/base.api";

// Every response is parsed with the core schemas (B4) — the client never
// trusts an unparsed payload, matching the strict-parsed ingress on the
// backend.

function buildListQueryString(query: EventListQuery): string {
  const params = new URLSearchParams();
  params.set("kind", query.kind);
  params.set("start", query.start);
  params.set("end", query.end);
  if (query.calendarIds !== undefined && query.calendarIds.length > 0) {
    params.set("calendarIds", query.calendarIds.join(","));
  }
  if (query.q !== undefined) {
    params.set("q", query.q);
  }

  return params.toString();
}

const EventApi = {
  list: async (
    query: EventListQuery,
    signal?: AbortSignal,
  ): Promise<Event[]> => {
    const response = await BaseApi.get<unknown>(
      `/event?${buildListQueryString(query)}`,
      { signal },
    );
    return EventListResponseSchema.parse(response.data).events;
  },

  create: async (input: CreateEventInput): Promise<Event> => {
    const response = await BaseApi.post<unknown>(`/event`, input);
    return EventResponseSchema.parse(response.data).event;
  },

  replace: async (id: EventId, input: ReplaceEventInput): Promise<Event> => {
    const response = await BaseApi.put<unknown>(
      `/event/${encodeURIComponent(id)}`,
      input,
    );
    return EventResponseSchema.parse(response.data).event;
  },

  delete: (id: EventId, scope: "this" | "thisAndFollowing" | "all") => {
    return BaseApi.delete<void>(
      `/event/${encodeURIComponent(id)}?scope=${scope}`,
    );
  },

  // Answer an invitation. The id addresses the target (a composite
  // occurrence id for one occurrence of a series); scope "single" answers
  // just that target, "all" the whole series. The backend answers 204 — the
  // browser is optimistic and the provider-confirmed list settles via SSE.
  rsvpEvent: async (id: EventId, input: RsvpEventInput): Promise<void> => {
    await BaseApi.post<void>(`/event/${encodeURIComponent(id)}/rsvp`, input);
  },
};

export { EventApi };
