import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { rest } from "msw";
import { type PropsWithChildren } from "react";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  HIDDEN_EVENT_FAILURE_MESSAGE,
  useHiddenEventIds,
  useToggleEventHidden,
} from "@web/events/hidden/hidden-events.query";
import { readHiddenEventIds } from "@web/events/hidden/hidden-events.storage";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
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
        toggle: useToggleEventHidden(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect([...result.current.ids]).toEqual(["evt-stored"]);
    });

    act(() => {
      result.current.toggle("evt-2");
    });

    await waitFor(() => {
      expect(result.current.ids.has("evt-stored")).toBe(true);
      expect(result.current.ids.has("evt-2")).toBe(true);
    });
    expect(readHiddenEventIds()).toEqual(["evt-stored", "evt-2"]);
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
      rest.get(hiddenEventsUrl, (_req, res, ctx) =>
        res(ctx.json({ hiddenEventIds: [] })),
      ),
      rest.put(hiddenEventsUrl, async (req, res, ctx) => {
        putBodies.push(await req.json());
        await putHold;
        return res(ctx.status(500), ctx.json({ message: "fail" }));
      }),
    );

    const { wrapper, queryClient } = createWrapper();
    seedHiddenEventIds(queryClient, [], "remote");

    const { result } = renderHook(
      () => ({
        ids: useHiddenEventIds(),
        toggle: useToggleEventHidden(),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.ids.size).toBe(0);
    });

    act(() => {
      result.current.toggle("evt-1");
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
  });
});
