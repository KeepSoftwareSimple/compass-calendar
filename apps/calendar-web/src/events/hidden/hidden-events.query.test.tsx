import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { type PropsWithChildren } from "react";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  hasPendingHiddenIntent,
  resetHiddenEventMutationCoordinatorForTests,
} from "@web/events/hidden/hidden-event-mutation-coordinator";
import {
  HIDDEN_EVENT_FAILURE_MESSAGE,
  hiddenEventsQueryOptions,
  useHiddenEventIds,
  useToggleEventHidden,
} from "@web/events/hidden/hidden-events.query";
import { readHiddenEventIds } from "@web/events/hidden/hidden-events.storage";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { useUndoHistoryStore } from "@web/events/stores/undo.store";
import { afterEach, describe, expect, it } from "bun:test";

const hiddenEventsUrl = `${ENV_WEB.API_BASEURL}/user/hidden-events`;

const createWrapper = (client?: QueryClient) => {
  const queryClient =
    client ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  return {
    queryClient,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
};

describe("hidden-events.query", () => {
  afterEach(() => {
    resetHiddenEventMutationCoordinatorForTests();
    persistentBrowserStore.remove(STORAGE_KEYS.HIDDEN_EVENT_IDS);
  });

  it("reads and toggles hidden ids from local storage without a network call", async () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.HIDDEN_EVENT_IDS,
      JSON.stringify(["evt-stored"]),
    );
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        ids: useHiddenEventIds(),
        hidden: useToggleEventHidden(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect([...result.current.ids]).toEqual(["evt-stored"]);
    });

    act(() => {
      result.current.hidden.toggleEventHidden("evt-2");
    });

    await waitFor(() => {
      expect(result.current.ids.has("evt-stored")).toBe(true);
      expect(result.current.ids.has("evt-2")).toBe(true);
    });
    expect(readHiddenEventIds()).toEqual(["evt-stored", "evt-2"]);
    expect(useUndoHistoryStore.getState().past).toEqual([
      { kind: "hidden", eventId: "evt-2", hidden: true },
    ]);
  });

  it("does not roll back a newer unhide when an older hide fails", async () => {
    act(() => refreshEventRepositorySource(true));
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);

    let resolveHide: (() => void) | undefined;
    const hideHold = new Promise<void>((resolve) => {
      resolveHide = () => resolve(undefined);
    });

    server.use(
      http.get(hiddenEventsUrl, () =>
        HttpResponse.json({ hiddenEventIds: [] }),
      ),
      http.put(hiddenEventsUrl, async ({ request }) => {
        const body = (await request.json()) as { hidden: boolean };
        if (body.hidden) {
          await hideHold;
          return HttpResponse.json({ message: "fail" }, { status: 500 });
        }
        return HttpResponse.json({ hiddenEventIds: [] });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    seedHiddenEventIds(queryClient, [], "remote");
    const { result } = renderHook(
      () => ({
        ids: useHiddenEventIds(),
        hidden: useToggleEventHidden(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.hidden.setEventHidden("evt-stale-fail", true);
    });
    await waitFor(() => {
      expect(result.current.ids.has("evt-stale-fail")).toBe(true);
    });

    act(() => {
      result.current.hidden.setEventHidden("evt-stale-fail", false);
    });
    await waitFor(() => {
      expect(result.current.ids.has("evt-stale-fail")).toBe(false);
    });

    act(() => {
      resolveHide?.();
    });

    await waitFor(() => {
      expect(result.current.ids.has("evt-stale-fail")).toBe(false);
    });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(hasPendingHiddenIntent("evt-stale-fail")).toBe(false);
  });

  it("merges in-flight intent when hidden ids refetch", async () => {
    act(() => refreshEventRepositorySource(true));

    let resolvePut: (() => void) | undefined;
    const putHold = new Promise<void>((resolve) => {
      resolvePut = () => resolve(undefined);
    });

    server.use(
      http.get(hiddenEventsUrl, () =>
        HttpResponse.json({ hiddenEventIds: [] }),
      ),
      http.put(hiddenEventsUrl, async () => {
        await putHold;
        return HttpResponse.json({ hiddenEventIds: ["evt-refetch"] });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    seedHiddenEventIds(queryClient, [], "remote");
    const { result } = renderHook(
      () => ({
        ids: useHiddenEventIds(),
        hidden: useToggleEventHidden(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.hidden.setEventHidden("evt-refetch", true);
    });
    await waitFor(() => {
      expect(result.current.ids.has("evt-refetch")).toBe(true);
    });
    expect(hasPendingHiddenIntent("evt-refetch")).toBe(true);

    await act(async () => {
      await queryClient.fetchQuery(hiddenEventsQueryOptions("remote"));
    });
    expect(result.current.ids.has("evt-refetch")).toBe(true);

    act(() => {
      resolvePut?.();
    });
    await waitFor(() => {
      expect(hasPendingHiddenIntent("evt-refetch")).toBe(false);
    });
  });

  it("keeps the latest hide when an earlier unhide response arrives late", async () => {
    act(() => refreshEventRepositorySource(true));

    let resolveUnhide: (() => void) | undefined;
    const unhideHold = new Promise<void>((resolve) => {
      resolveUnhide = () => resolve(undefined);
    });
    const putBodies: Array<{ eventId: string; hidden: boolean }> = [];

    server.use(
      http.get(hiddenEventsUrl, () =>
        HttpResponse.json({ hiddenEventIds: [] }),
      ),
      http.put(hiddenEventsUrl, async ({ request }) => {
        const body = (await request.json()) as {
          eventId: string;
          hidden: boolean;
        };
        putBodies.push(body);
        if (body.hidden) {
          return HttpResponse.json({ hiddenEventIds: [body.eventId] });
        }
        await unhideHold;
        return HttpResponse.json({ hiddenEventIds: [] });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    seedHiddenEventIds(queryClient, [], "remote");
    const { result } = renderHook(
      () => ({
        ids: useHiddenEventIds(),
        hidden: useToggleEventHidden(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.ids.size).toBe(0);
    });

    act(() => {
      result.current.hidden.setEventHidden("evt-race", true);
    });
    await waitFor(() => {
      expect(result.current.ids.has("evt-race")).toBe(true);
    });

    act(() => {
      result.current.hidden.setEventHidden("evt-race", false);
    });
    await waitFor(() => {
      expect(putBodies).toHaveLength(2);
    });

    act(() => {
      result.current.hidden.setEventHidden("evt-race", true);
    });
    await waitFor(() => {
      expect(result.current.ids.has("evt-race")).toBe(true);
    });
    expect(putBodies).toHaveLength(2);

    act(() => {
      resolveUnhide?.();
    });

    await waitFor(() => {
      expect(putBodies).toHaveLength(3);
      expect(result.current.ids.has("evt-race")).toBe(true);
    });
    expect(putBodies).toEqual([
      { eventId: "evt-race", hidden: true },
      { eventId: "evt-race", hidden: false },
      { eventId: "evt-race", hidden: true },
    ]);
  });

  it("sends one PUT, updates before the response, and rolls back with a toast on 500", async () => {
    act(() => refreshEventRepositorySource(true));
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);

    let resolvePut: ((value: unknown) => void) | undefined;
    const putHold = new Promise((resolve) => {
      resolvePut = resolve;
    });
    const putBodies: unknown[] = [];

    server.use(
      http.get(hiddenEventsUrl, () =>
        HttpResponse.json({ hiddenEventIds: [] }),
      ),
      http.put(hiddenEventsUrl, async ({ request }) => {
        putBodies.push(await request.json());
        await putHold;
        return HttpResponse.json({ message: "fail" }, { status: 500 });
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    seedHiddenEventIds(queryClient, [], "remote");

    const { result } = renderHook(
      () => ({
        ids: useHiddenEventIds(),
        hidden: useToggleEventHidden(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.ids.size).toBe(0);
    });

    act(() => {
      result.current.hidden.toggleEventHidden("evt-1");
    });

    await waitFor(() => {
      expect(result.current.ids.has("evt-1")).toBe(true);
    });

    await waitFor(() => {
      expect(putBodies).toEqual([{ eventId: "evt-1", hidden: true }]);
    });

    act(() => {
      resolvePut?.(undefined);
    });

    await waitFor(() => {
      expect(result.current.ids.has("evt-1")).toBe(false);
    });
    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(mocks.error).toHaveBeenCalledWith(
      HIDDEN_EVENT_FAILURE_MESSAGE,
      expect.objectContaining({ role: "alert" }),
    );
    expect(useUndoHistoryStore.getState().past).toHaveLength(0);
  });

  it("setEventHidden writes the given state and records it once it lands", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        ids: useHiddenEventIds(),
        hidden: useToggleEventHidden(),
      }),
      { wrapper },
    );

    act(() => {
      result.current.hidden.setEventHidden("evt-show", true);
    });
    await waitFor(() => {
      expect(result.current.ids.has("evt-show")).toBe(true);
    });
    expect(useUndoHistoryStore.getState().past).toEqual([
      { kind: "hidden", eventId: "evt-show", hidden: true },
    ]);

    act(() => {
      result.current.hidden.setEventHidden("evt-show", false);
    });
    await waitFor(() => {
      expect(result.current.ids.has("evt-show")).toBe(false);
    });
    expect(useUndoHistoryStore.getState().past.at(-1)).toEqual({
      kind: "hidden",
      eventId: "evt-show",
      hidden: false,
    });
  });
});
