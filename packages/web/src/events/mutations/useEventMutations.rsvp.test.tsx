import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { jsonResponse } from "@web/__tests__/helpers/msw-v2";
import { act, type PropsWithChildren } from "react";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { composeOccurrenceId } from "@core/util/occurrence-id";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import { useEventMutations } from "./useEventMutations";
import { describe, expect, it } from "bun:test";

// WP-08: what an RSVP puts on the wire (through MSW and the real
// EventApi/BaseApi stack), what it paints optimistically (only the caller's
// own status dot), and that it rolls back on failure and settles by
// invalidation (the same path SSE eventsChanged converges through).

const ACCOUNT_EMAIL = "Me@Example.com";

const weekKey = eventQueryKeys.week({
  source: "remote",
  start: "2026-05-04T00:00:00.000Z",
  end: "2026-05-11T00:00:00.000Z",
});

const selfEntry = (
  responseStatus: Attendee["responseStatus"] = "needsAction",
): Attendee => ({
  // Deliberately lower-cased vs ACCOUNT_EMAIL: the self match must be
  // case-insensitive, like sync's.
  email: "me@example.com",
  displayName: null,
  responseStatus,
});

const otherGuest: Attendee = {
  email: "guest@example.com",
  displayName: "Guest One",
  responseStatus: "declined",
};

const invitedEvent = (overrides: Partial<Event> = {}): Event =>
  createMockEvent({
    content: {
      kind: "details",
      title: "Planning",
      description: "",
      attendees: [selfEntry(), otherGuest],
    },
    ...overrides,
  });

const normalized = (...events: Event[]): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useEventMutations({
        source: "remote",
        markWrite: async () => {},
        reportError: () => {},
      }),
    { wrapper },
  );
  return { hook, queryClient };
};

const captureRsvpRequests = () => {
  const requests: Array<{ path: string; body: unknown }> = [];
  server.use(
    http.post(
      `${ENV_WEB.API_BASEURL}/event/:id/rsvp`,
      async ({ request, params }) => {
        requests.push({ path: new URL(request.url).pathname, body: await request.json() });
        return new HttpResponse(null, { status: 204 });
      },
    ),
  );
  return requests;
};

const cachedAttendees = (
  queryClient: QueryClient,
  id: string,
): readonly Attendee[] | undefined => {
  const cached =
    queryClient.getQueryData<NormalizedEventQueryData>(weekKey)?.entities[
      EventIdSchema.parse(id)
    ];
  return cached?.content.kind === "details"
    ? cached.content.attendees
    : undefined;
};

describe("useEventMutations rsvp on the wire (MSW)", () => {
  it("posts responseStatus + scope single for an accept on a single event", async () => {
    const requests = captureRsvpRequests();
    const event = invitedEvent();
    const { hook } = setup();

    act(() => {
      hook.result.current.rsvp({
        id: event.id,
        responseStatus: "accepted",
        scope: "single",
        accountEmail: ACCOUNT_EMAIL,
      });
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]?.path.endsWith(`/event/${event.id}/rsvp`)).toBe(true);
    expect(requests[0]?.body).toEqual({
      responseStatus: "accepted",
      scope: "single",
    });
  });

  it("posts the composite occurrence id for a decline scoped to this event", async () => {
    const requests = captureRsvpRequests();
    const seriesId = createObjectIdString();
    const occurrenceId = composeOccurrenceId({
      eventId: seriesId,
      recurrenceId: "2026-05-05T09:00:00.000Z",
    });
    const occurrence = invitedEvent({
      id: EventIdSchema.parse(occurrenceId),
      recurrence: {
        kind: "occurrence",
        seriesId: EventIdSchema.parse(seriesId),
      },
    });
    const { hook } = setup();

    act(() => {
      hook.result.current.rsvp({
        id: occurrence.id,
        responseStatus: "declined",
        scope: "single",
        accountEmail: ACCOUNT_EMAIL,
      });
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    // The occurrence id (not the bare series id) rides the URL, so the
    // backend's decode addresses exactly that occurrence.
    expect(
      requests[0]?.path.endsWith(
        `/event/${encodeURIComponent(occurrenceId)}/rsvp`,
      ),
    ).toBe(true);
    expect(requests[0]?.body).toEqual({
      responseStatus: "declined",
      scope: "single",
    });
  });
});

describe("useEventMutations optimistic rsvp", () => {
  it("paints only the caller's own status immediately and rolls back on failure", async () => {
    // Hold the 503 until the optimistic paint is asserted — a same-tick
    // failure would roll back before the assertion could observe the paint.
    let failRequest = () => {};
    const gate = new Promise<void>((resolve) => {
      failRequest = resolve;
    });
    server.use(
      http.post(
        `${ENV_WEB.API_BASEURL}/event/:id/rsvp`,
        async ({ request }) => {
          await gate;
          return jsonResponse({
              code: "SYNC_UNAVAILABLE",
              message: "Sync command unavailable",
              retryable: true,
            }, 503);
        },
      ),
    );
    const event = invitedEvent();
    const { hook, queryClient } = setup();
    queryClient.setQueryData(weekKey, normalized(event));

    act(() => {
      hook.result.current.rsvp({
        id: event.id,
        responseStatus: "accepted",
        scope: "single",
        accountEmail: ACCOUNT_EMAIL,
      });
    });

    // Optimistic: self flips to accepted; the other guest's provider-owned
    // status is untouched.
    await waitFor(() => {
      expect(cachedAttendees(queryClient, event.id)).toEqual([
        selfEntry("accepted"),
        otherGuest,
      ]);
    });

    act(() => failRequest());

    // Rollback: the 503 restores the pre-answer list.
    await waitFor(() => {
      expect(cachedAttendees(queryClient, event.id)).toEqual([
        selfEntry(),
        otherGuest,
      ]);
    });
  });

  it("paints the master and every cached occurrence for a series-wide answer", async () => {
    captureRsvpRequests();
    const seriesId = EventIdSchema.parse(createObjectIdString());
    const master = invitedEvent({
      id: seriesId,
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const occurrenceAt = (recurrenceId: string): Event =>
      invitedEvent({
        id: EventIdSchema.parse(
          composeOccurrenceId({ eventId: seriesId, recurrenceId }),
        ),
        recurrence: { kind: "occurrence", seriesId },
      });
    const first = occurrenceAt("2026-05-05T09:00:00.000Z");
    const second = occurrenceAt("2026-05-06T09:00:00.000Z");
    const { hook, queryClient } = setup();
    queryClient.setQueryData(weekKey, normalized(master, first, second));

    act(() => {
      hook.result.current.rsvp({
        id: first.id,
        responseStatus: "tentative",
        scope: "all",
        accountEmail: ACCOUNT_EMAIL,
      });
    });

    await waitFor(() => {
      for (const id of [master.id, first.id, second.id]) {
        expect(cachedAttendees(queryClient, id)).toEqual([
          selfEntry("tentative"),
          otherGuest,
        ]);
      }
    });
  });

  // Regression only — the live-update path already exists: a confirmed RSVP
  // settles by invalidating the event queries, the same invalidation SSE
  // eventsChanged rides, so the provider-confirmed list (anyone's RSVP, not
  // just ours) wins over the optimistic paint on the next refetch.
  it("invalidates event queries after the answer settles", async () => {
    const requests = captureRsvpRequests();
    const event = invitedEvent();
    const { hook, queryClient } = setup();
    queryClient.setQueryData(weekKey, normalized(event));

    act(() => {
      hook.result.current.rsvp({
        id: event.id,
        responseStatus: "accepted",
        scope: "single",
        accountEmail: ACCOUNT_EMAIL,
      });
    });

    await waitFor(() => expect(requests).toHaveLength(1));
    await waitFor(() => {
      expect(queryClient.getQueryState(weekKey)?.isInvalidated).toBe(true);
    });
  });
});
