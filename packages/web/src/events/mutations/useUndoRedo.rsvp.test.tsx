import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { rest } from "msw";
import { act, type PropsWithChildren } from "react";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { UNDO_DECLINED_TOAST_ID } from "@web/common/constants/toast.constants";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import { useUndoHistoryStore } from "@web/events/stores/undo.store";
import { useEventMutations } from "./useEventMutations";
import { useUndoRedo } from "./useUndoRedo";
import { describe, expect, it } from "bun:test";

const ACCOUNT_EMAIL = "Me@Example.com";

const weekKey = eventQueryKeys.week({
  source: "remote",
  start: "2026-05-04T00:00:00.000Z",
  end: "2026-05-11T00:00:00.000Z",
});

const selfEntry = (
  responseStatus: Attendee["responseStatus"] = "declined",
): Attendee => ({
  email: "me@example.com",
  displayName: null,
  responseStatus,
});

const otherGuest: Attendee = {
  email: "guest@example.com",
  displayName: "Guest One",
  responseStatus: "tentative",
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

const cachedSelfStatus = (queryClient: QueryClient, id: string) => {
  const cached =
    queryClient.getQueryData<NormalizedEventQueryData>(weekKey)?.entities[
      EventIdSchema.parse(id)
    ];
  return cached?.content.kind === "details"
    ? cached.content.attendees?.find(
        (attendee) => attendee.email.toLowerCase() === "me@example.com",
      )?.responseStatus
    : undefined;
};

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const dependencies = {
    source: "remote" as const,
    markWrite: async () => {},
    reportError: () => {},
  };
  const hook = renderHook(
    () => ({
      mutations: useEventMutations(dependencies),
      undoRedo: useUndoRedo(dependencies),
    }),
    { wrapper },
  );
  return { hook, queryClient };
};

const captureRsvpRequests = () => {
  const requests: Array<{ path: string; body: unknown }> = [];
  server.use(
    rest.post(
      `${ENV_WEB.API_BASEURL}/event/:id/rsvp`,
      async (req, res, ctx) => {
        requests.push({ path: req.url.pathname, body: await req.json() });
        return res(ctx.status(204));
      },
    ),
  );
  return requests;
};

describe("useUndoRedo rsvp", () => {
  it("restores the previous RSVP on undo and re-applies it on redo", async () => {
    const requests = captureRsvpRequests();
    const event = invitedEvent();
    const { hook, queryClient } = setup();
    queryClient.setQueryData(weekKey, normalized(event));

    act(() => {
      hook.result.current.mutations.rsvp({
        id: event.id,
        responseStatus: "accepted",
        scope: "single",
        accountEmail: ACCOUNT_EMAIL,
      });
    });
    await waitFor(() => {
      expect(hook.result.current.undoRedo.canUndo).toBe(true);
      expect(cachedSelfStatus(queryClient, event.id)).toBe("accepted");
    });

    act(() => hook.result.current.undoRedo.undo());
    await waitFor(() => {
      expect(cachedSelfStatus(queryClient, event.id)).toBe("declined");
    });
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
    expect(hook.result.current.undoRedo.canRedo).toBe(true);
    expect(requests.at(-1)?.body).toEqual({
      responseStatus: "declined",
      scope: "single",
    });

    act(() => hook.result.current.undoRedo.redo());
    await waitFor(() => {
      expect(cachedSelfStatus(queryClient, event.id)).toBe("accepted");
    });
    expect(useUndoHistoryStore.getState().past).toHaveLength(1);
    expect(requests.at(-1)?.body).toEqual({
      responseStatus: "accepted",
      scope: "single",
    });
  });

  it("declines a stale RSVP undo with the existing changed-since toast", async () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);
    const requests = captureRsvpRequests();
    const event = invitedEvent();
    const { hook, queryClient } = setup();
    queryClient.setQueryData(weekKey, normalized(event));

    act(() => {
      hook.result.current.mutations.rsvp({
        id: event.id,
        responseStatus: "accepted",
        scope: "single",
        accountEmail: ACCOUNT_EMAIL,
      });
    });
    await waitFor(() => {
      expect(hook.result.current.undoRedo.canUndo).toBe(true);
    });

    queryClient.setQueryData(
      weekKey,
      normalized({
        ...event,
        content: {
          kind: "details",
          title: "Planning",
          description: "",
          attendees: [selfEntry("tentative"), otherGuest],
        },
      }),
    );

    act(() => hook.result.current.undoRedo.undo());

    expect(mocks.update).toHaveBeenCalledWith(
      UNDO_DECLINED_TOAST_ID,
      expect.objectContaining({ render: "Can't undo. Event changed since" }),
    );
    expect(hook.result.current.undoRedo.canUndo).toBe(false);
    expect(hook.result.current.undoRedo.canRedo).toBe(false);
    expect(cachedSelfStatus(queryClient, event.id)).toBe("tentative");
    expect(requests).toHaveLength(1);
  });
});
