import { createGridEventDraft } from "@web/events/grid-event-draft.adapter";
import {
  eventPastePreviewActions,
  initialEventPastePreviewState,
  useEventPastePreviewStore,
} from "@web/events/stores/event-paste-preview.store";
import { beforeEach, describe, expect, it } from "bun:test";

const placement = createGridEventDraft({
  kind: "allDay",
  start: new Date("2026-05-20"),
  end: new Date("2026-05-21"),
});

describe("event-paste-preview.store", () => {
  beforeEach(() => {
    useEventPastePreviewStore.setState(initialEventPastePreviewState, true);
  });

  it("activates paste placement mode", () => {
    eventPastePreviewActions.setPlacement(placement);
    expect(useEventPastePreviewStore.getState()).toMatchObject({
      placement,
    });
  });

  it("deactivates back to the initial state", () => {
    eventPastePreviewActions.setPlacement(placement);
    eventPastePreviewActions.deactivate();
    expect(useEventPastePreviewStore.getState()).toEqual(
      initialEventPastePreviewState,
    );
  });
});
