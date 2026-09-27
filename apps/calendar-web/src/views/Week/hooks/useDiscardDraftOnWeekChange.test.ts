import { renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { createGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { useDiscardDraftOnWeekChange } from "./useDiscardDraftOnWeekChange";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  draftActions.discard();
});

describe("useDiscardDraftOnWeekChange", () => {
  it("keeps a draft that was seeded before the hook mounted", () => {
    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: createGridEventDraft({
        kind: "allDay",
        start: new Date("2026-05-20"),
        end: new Date("2026-05-21"),
      }),
    });

    renderHook(() => useDiscardDraftOnWeekChange(20));

    expect(useDraftStore.getState().gridDraft).not.toBeNull();
  });

  it("keeps a pre-mounted draft through StrictMode's double effect", () => {
    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: createGridEventDraft({
        kind: "allDay",
        start: new Date("2026-05-20"),
        end: new Date("2026-05-21"),
      }),
    });

    renderHook(() => useDiscardDraftOnWeekChange(20), {
      wrapper: StrictMode,
    });

    expect(useDraftStore.getState().gridDraft).not.toBeNull();
  });

  it("discards the draft when the visible week changes", () => {
    const { rerender } = renderHook(
      ({ week }) => useDiscardDraftOnWeekChange(week),
      { initialProps: { week: 20 } },
    );

    draftActions.startGridDraft({
      activity: "keyboardPlace",
      draft: createGridEventDraft({
        kind: "allDay",
        start: new Date("2026-05-20"),
        end: new Date("2026-05-21"),
      }),
    });

    rerender({ week: 21 });

    expect(useDraftStore.getState().gridDraft).toBeNull();
    expect(useDraftStore.getState().status?.isDrafting).toBe(false);
  });
});
