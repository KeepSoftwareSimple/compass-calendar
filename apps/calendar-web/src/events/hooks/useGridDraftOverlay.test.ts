import { renderHook } from "@testing-library/react";
import { createGridEventDraft } from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  initialDraftState,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { useGridDraftOverlay } from "./useGridDraftOverlay";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  useDraftStore.setState(initialDraftState, true);
});

describe("useGridDraftOverlay", () => {
  it("returns a stable overlay while the grid draft is unchanged", () => {
    const draft = createGridEventDraft({
      kind: "timed",
      start: new Date("2026-05-26T14:00:00.000Z"),
      end: new Date("2026-05-26T15:00:00.000Z"),
      timeZone: "UTC",
    });
    draftActions.startGridDraft({ activity: "gridClick", draft });

    const { result, rerender } = renderHook(() => useGridDraftOverlay());
    const first = result.current;

    expect(first).not.toBeNull();

    rerender();

    expect(result.current).toBe(first);
  });

  it("returns null when there is no grid draft", () => {
    const { result } = renderHook(() => useGridDraftOverlay());

    expect(result.current).toBeNull();
  });
});
