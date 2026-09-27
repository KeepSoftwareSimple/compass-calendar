import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { useHiddenEventIds } from "@web/events/hidden/hidden-events.query";
import { resetEventRepositorySourceForTests } from "@web/events/repositories/event.repository.source.store";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { useHideEventShortcut } from "@web/shortcuts/hide-event/useHideEventShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const pressX = () => {
  (document.activeElement ?? document).dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "x",
      bubbles: true,
      cancelable: true,
    }),
  );
};

const addEventCard = (eventId: string) => {
  const card = document.createElement("div");
  card.setAttribute("data-week-interaction-event-id", eventId);
  card.tabIndex = 0;
  document.body.appendChild(card);
  return card;
};

describe("useHideEventShortcut", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
    resetEventRepositorySourceForTests();
    document.body.innerHTML = "";
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    seedHiddenEventIds(queryClient, []);
  });

  afterEach(() => {
    clearAppLockReasons();
    eventJumpActions.reset();
    resetEventRepositorySourceForTests();
    document.body.innerHTML = "";
    persistentBrowserStore.remove(STORAGE_KEYS.HIDDEN_EVENT_IDS);
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("toggles the focused event in the hidden set, and a second x unhides it", async () => {
    const { result } = renderHook(
      () => {
        useHideEventShortcut();
        return useHiddenEventIds();
      },
      { wrapper },
    );
    const card = addEventCard("event-1");
    card.focus();

    act(() => {
      pressX();
    });
    await waitFor(() => {
      expect(result.current.has("event-1")).toBe(true);
    });

    act(() => {
      pressX();
    });
    await waitFor(() => {
      expect(result.current.has("event-1")).toBe(false);
    });
  });

  it("does nothing when focus is not on an event card", async () => {
    const { result } = renderHook(
      () => {
        useHideEventShortcut();
        return useHiddenEventIds();
      },
      { wrapper },
    );
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();

    act(() => {
      pressX();
    });

    await waitFor(() => {
      expect(result.current.size).toBe(0);
    });
  });

  it("yields while app-locked or event jump is active", async () => {
    const { result } = renderHook(
      () => {
        useHideEventShortcut();
        return useHiddenEventIds();
      },
      { wrapper },
    );
    const card = addEventCard("event-1");
    card.focus();

    setAppLockReason("commandPalette", true);
    act(() => {
      pressX();
    });
    expect(result.current.has("event-1")).toBe(false);
    clearAppLockReasons();

    eventJumpActions.setActive(true);
    act(() => {
      pressX();
    });
    expect(result.current.has("event-1")).toBe(false);
  });
});
