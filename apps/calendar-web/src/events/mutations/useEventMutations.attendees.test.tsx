import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { act, type PropsWithChildren } from "react";
import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type ReplaceEventInput } from "@core/types/event-command.contracts";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import { RemoteEventRepository } from "@web/events/repositories/remote.event.repository";
import { useEventMutations } from "./useEventMutations";
import { describe, expect, it } from "bun:test";

// WP-04: what a guest edit puts ON THE WIRE (through MSW and the real
// RemoteEventRepository/BaseApi stack) and what it paints optimistically.

const weekKey = eventQueryKeys.week({
  source: "remote",
  start: "2026-05-04T00:00:00.000Z",
  end: "2026-05-11T00:00:00.000Z",
});

const meetingEvent = (overrides: Partial<Event> = {}): Event =>
  createMockEvent({
    content: {
      kind: "details",
      title: "Weekly sync",
      description: "",
      attendees: [
        {
          email: "guest@example.com",
          displayName: "Guest One",
          responseStatus: "accepted",
        },
      ],
    },
    ...overrides,
  });

const normalized = (...events: Event[]): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

const replaceInput = (
  event: Event,
  overrides: Partial<ReplaceEventInput> = {},
): ReplaceEventInput =>
  ({
    content: {
      kind: "details",
      title: "Weekly sync",
      description: "",
      location: "",
      color: null,
    },
    schedule: event.schedule,
    recurrence: { kind: "preserve" },
    scope: "this",
    ...overrides,
  }) as ReplaceEventInput;

const setup = (repository?: EventRepository) => {
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
        repository: repository ?? new RemoteEventRepository(),
        markWrite: async () => {},
        reportError: () => {},
      }),
    { wrapper },
  );
  return { hook, queryClient };
};

const captureReplaceBody = () => {
  const bodies: unknown[] = [];
  server.use(
    http.put(
      `${ENV_WEB.API_BASEURL}/event/:id`,
      async ({ request, params }) => {
        bodies.push(await request.json());
        return HttpResponse.json({
          event: meetingEvent({ id: params.id as EventId }),
        });
      },
    ),
  );
  return bodies;
};

describe("useEventMutations guest edits on the wire (MSW)", () => {
  it("sends content.attendees and invitation for a guest-edit replace", async () => {
    const bodies = captureReplaceBody();
    const event = meetingEvent();
    const { hook } = setup();

    act(() => {
      hook.result.current.replace({
        id: event.id,
        input: replaceInput(event, {
          content: {
            kind: "details",
            title: "Weekly sync",
            description: "",
            location: "",
            color: null,
            attendees: [
              { email: "guest@example.com", displayName: null },
              { email: "new-guest@example.com", displayName: null },
            ],
          },
          invitation: "all",
        }),
      });
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    const body = bodies[0] as {
      content: { attendees?: unknown };
      invitation?: string;
    };
    expect(body.content.attendees).toEqual([
      { email: "guest@example.com", displayName: null },
      { email: "new-guest@example.com", displayName: null },
    ]);
    expect(body.invitation).toBe("all");
  });

  it("omits attendees and invitation entirely for an untouched save", async () => {
    const bodies = captureReplaceBody();
    const event = meetingEvent();
    const { hook } = setup();

    act(() => {
      hook.result.current.replace({ id: event.id, input: replaceInput(event) });
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    const body = bodies[0] as { content: object } & object;
    expect(body.content).not.toContainKey("attendees");
    expect(body).not.toContainKey("invitation");
  });

  it("strips replayed read-shaped attendee entries at the wire boundary (undo/redo stays preserve)", async () => {
    const bodies = captureReplaceBody();
    const event = meetingEvent();
    const { hook } = setup();

    act(() => {
      hook.result.current.replace({
        id: event.id,
        input: replaceInput(event, {
          // What useUndoRedo replays: full read content, responseStatus and all.
          content: {
            kind: "details",
            title: "Weekly sync",
            description: "",
            location: "",
            color: null,
            attendees: [
              {
                email: "guest@example.com",
                displayName: "Guest One",
                responseStatus: "accepted",
              },
            ],
          } as unknown as ReplaceEventInput["content"],
        }),
      });
    });

    await waitFor(() => expect(bodies).toHaveLength(1));
    const body = bodies[0] as { content: object };
    expect(body.content).not.toContainKey("attendees");
  });
});

describe("useEventMutations optimistic guest list", () => {
  it("paints retained guests with their current status and new guests as needsAction, then rolls back on failure", async () => {
    const event = meetingEvent();
    let rejectWrite: (reason: Error) => void = () => {};
    const repository: EventRepository = {
      list: async () => [],
      create: async () => event,
      replace: () =>
        new Promise<Event>((_, reject) => {
          rejectWrite = reject;
        }),
      delete: async () => {},
    };
    const { hook, queryClient } = setup(repository);
    queryClient.setQueryData(weekKey, normalized(event));

    act(() => {
      hook.result.current.replace({
        id: event.id,
        input: replaceInput(event, {
          content: {
            kind: "details",
            title: "Weekly sync",
            description: "",
            location: "",
            color: null,
            attendees: [
              { email: "guest@example.com", displayName: null },
              { email: "new-guest@example.com", displayName: "New Guest" },
            ],
          },
          invitation: "all",
        }),
      });
    });

    // onMutate awaits cancelQueries before painting, so the optimistic list
    // lands a microtask later.
    await waitFor(() => {
      const optimistic =
        queryClient.getQueryData<NormalizedEventQueryData>(weekKey)?.entities[
          event.id
        ];
      expect(
        optimistic?.content.kind === "details"
          ? optimistic.content.attendees
          : undefined,
      ).toEqual([
        // Retained: keeps the provider's responseStatus and displayName.
        {
          email: "guest@example.com",
          displayName: "Guest One",
          responseStatus: "accepted",
        },
        // New: enters as needsAction until sync settles the truth.
        {
          email: "new-guest@example.com",
          displayName: "New Guest",
          responseStatus: "needsAction",
        },
      ]);
    });

    act(() => {
      rejectWrite(new Error("save failed"));
    });

    // Rollback restores the pre-edit guest list.
    await waitFor(() => {
      const restored =
        queryClient.getQueryData<NormalizedEventQueryData>(weekKey)?.entities[
          event.id
        ];
      expect(
        restored?.content.kind === "details"
          ? restored.content.attendees
          : undefined,
      ).toEqual([
        {
          email: "guest@example.com",
          displayName: "Guest One",
          responseStatus: "accepted",
        },
      ]);
    });
  });

  it("inserts a create's intended guests as needsAction optimistically", async () => {
    const repository: EventRepository = {
      list: async () => [],
      create: () => new Promise<Event>(() => {}),
      replace: async (id) => meetingEvent({ id }),
      delete: async () => {},
    };
    const { hook, queryClient } = setup(repository);
    queryClient.setQueryData(weekKey, normalized());
    const event = meetingEvent();

    act(() => {
      hook.result.current.create({
        id: event.id,
        calendarId: event.calendarId,
        content: {
          kind: "details",
          title: "Kickoff",
          description: "",
          location: "",
          color: null,
          attendees: [{ email: "new-guest@example.com", displayName: null }],
        },
        schedule: event.schedule,
        recurrence: { kind: "single" },
      });
    });

    await waitFor(() => {
      const inserted =
        queryClient.getQueryData<NormalizedEventQueryData>(weekKey)?.entities[
          event.id
        ];
      expect(
        inserted?.content.kind === "details"
          ? inserted.content.attendees
          : undefined,
      ).toEqual([
        {
          email: "new-guest@example.com",
          displayName: null,
          responseStatus: "needsAction",
        },
      ]);
    });
  });
});
