import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { type Event } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { type NormalizedEventQueryData } from "@web/events/queries/event.query.types";
import {
  draftActions,
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { useSetEventColor } from "./useSetEventColor";
import { beforeEach, describe, expect, it } from "bun:test";

const calendarKey = eventQueryKeys.week({
  source: "local",
  start: "2026-07-01T00:00:00.000Z",
  end: "2026-07-08T00:00:00.000Z",
});

const normalized = (...events: Event[]): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

function createWrapper(events: Event[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(calendarKey, normalized(...events));

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, Wrapper };
}

describe("useSetEventColor", () => {
  beforeEach(() => {
    draftActions.discard();
  });

  it("paints the new color on the draft before the optimistic replace lands", async () => {
    const existing = createMockEvent({
      content: {
        kind: "details",
        title: "All day",
        description: "",
        color: "blue",
      },
      schedule: {
        kind: "allDay",
        start: "2026-07-02" as never,
        end: "2026-07-03" as never,
      },
    });
    const { queryClient, Wrapper } = createWrapper([existing]);
    const { result } = renderHook(() => useSetEventColor(existing.id), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current("coral");
    });

    expect(useDraftStore.getState().gridDraft?.values.color).toBe("coral");

    await waitFor(() => {
      expect(
        (
          queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)!
            .entities[existing.id].content as { color?: string }
        ).color,
      ).toBe("coral");
    });

    await waitFor(() => {
      expect(useDraftStore.getState()).toEqual(initialDraftState);
    });
  });

  it("discards immediately when the color is unchanged", () => {
    const existing = createMockEvent({
      content: {
        kind: "details",
        title: "All day",
        description: "",
        color: "coral",
      },
    });
    const draft = editGridEventDraft(existing);
    if (!draft) throw new Error("expected edit draft");
    draftActions.startGridDraft({ activity: "eventRightClick", draft });

    const { Wrapper } = createWrapper([existing]);
    const { result } = renderHook(() => useSetEventColor(existing.id), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current("coral");
    });

    expect(useDraftStore.getState()).toEqual(initialDraftState);
  });

  it("rewrites the same slot when a provider colorHex is still winning the palette", async () => {
    const existing = createMockEvent({
      content: {
        kind: "details",
        title: "Labeled",
        description: "",
        color: "coral",
        colorHex: "#009688",
      },
      schedule: {
        kind: "allDay",
        start: "2026-07-02" as never,
        end: "2026-07-03" as never,
      },
    });
    const { queryClient, Wrapper } = createWrapper([existing]);
    const { result } = renderHook(() => useSetEventColor(existing.id), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current("coral");
    });

    await waitFor(() => {
      const content =
        queryClient.getQueryData<NormalizedEventQueryData>(calendarKey)
          ?.entities[existing.id]?.content;
      expect(content).toMatchObject({ color: "coral" });
      expect(content).not.toHaveProperty("colorHex");
    });
  });

  it("updates a right-click draft that still held the old color", async () => {
    const existing = createMockEvent({
      content: {
        kind: "details",
        title: "Timed",
        description: "",
        color: "blue",
      },
      schedule: {
        kind: "timed",
        start: "2026-07-02T16:00:00.000Z" as never,
        end: "2026-07-02T17:00:00.000Z" as never,
        timeZone: "UTC" as never,
      },
    });
    const draft = editGridEventDraft(existing);
    if (!draft) throw new Error("expected edit draft");
    expect(draft.values.color).toBe("blue");
    draftActions.startGridDraft({ activity: "eventRightClick", draft });

    const { Wrapper } = createWrapper([existing]);
    const { result } = renderHook(() => useSetEventColor(existing.id), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current("mint");
    });

    // Draft keeps the new color until onOptimisticApplied discards it.
    expect(useDraftStore.getState().gridDraft?.values.color).toBe("mint");

    await waitFor(() => {
      expect(useDraftStore.getState()).toEqual(initialDraftState);
    });
  });
});
