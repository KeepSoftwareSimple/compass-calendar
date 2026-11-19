import { HotkeyManager } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type PropsWithChildren } from "react";
import { toNormalizedEventQueryData } from "@web/__tests__/utils/event-query-test-data";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { draftActions } from "@web/events/stores/draft.store";
import { clearAppLockReasons } from "@web/shortcuts/app-lock";
import { useOpenLocationShortcut } from "@web/shortcuts/open-location/useOpenLocationShortcut";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const EVENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const MAPS_URL = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const eventWithLocation = (location: string) =>
  createMockEvent({
    id: EVENT_ID as never,
    content: { kind: "details", title: "Lunch", description: "", location },
  });

const cacheEvent = (queryClient: QueryClient, location: string) =>
  queryClient.setQueryData(
    eventQueryKeys.week({
      source: "local",
      start: "2026-07-01T00:00:00.000Z",
      end: "2026-07-08T00:00:00.000Z",
    }),
    toNormalizedEventQueryData([eventWithLocation(location)]),
  );

const addEventCard = () => {
  const card = document.createElement("div");
  card.setAttribute("data-week-interaction-event-id", EVENT_ID);
  card.setAttribute("data-week-interaction-event-type", "timed");
  card.tabIndex = 0;
  document.body.appendChild(card);
  return card;
};

describe("useOpenLocationShortcut", () => {
  let queryClient: QueryClient;
  let openSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    HotkeyManager.resetInstance();
    clearAppLockReasons();
    draftActions.discard();
    document.body.innerHTML = "";
    queryClient = new QueryClient();
    openSpy = spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
    draftActions.discard();
    document.body.innerHTML = "";
  });

  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("opens the focused grid event's location in Google Maps", async () => {
    cacheEvent(queryClient, "Blue Bottle, Oakland");
    renderHook(() => useOpenLocationShortcut(), { wrapper });
    addEventCard().focus();

    await userEvent.keyboard("{Control>}{Shift>}M{/Shift}{/Control}");

    expect(openSpy).toHaveBeenCalledWith(
      MAPS_URL("Blue Bottle, Oakland"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens the open form's draft location, including unsaved edits", async () => {
    const draft = editGridEventDraft(eventWithLocation("Old place"));
    if (!draft) throw new Error("expected an edit draft");
    draft.values.location = "New place";
    draftActions.startGridDraft({ activity: "keyboardEdit", draft });
    renderHook(() => useOpenLocationShortcut(), { wrapper });

    await userEvent.keyboard("{Control>}{Shift>}M{/Shift}{/Control}");

    expect(openSpy).toHaveBeenCalledWith(
      MAPS_URL("New place"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does nothing when the focused event has no location", async () => {
    cacheEvent(queryClient, "  ");
    renderHook(() => useOpenLocationShortcut(), { wrapper });
    addEventCard().focus();

    await userEvent.keyboard("{Control>}{Shift>}M{/Shift}{/Control}");

    expect(openSpy).not.toHaveBeenCalled();
  });
});
