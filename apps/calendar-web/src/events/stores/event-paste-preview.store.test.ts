import {
  eventPastePreviewActions,
  initialEventPastePreviewState,
  useEventPastePreviewStore,
} from "@web/events/stores/event-paste-preview.store";
import { beforeEach, describe, expect, it } from "bun:test";

describe("event-paste-preview.store", () => {
  beforeEach(() => {
    useEventPastePreviewStore.setState(initialEventPastePreviewState, true);
  });

  it("activates paste placement mode", () => {
    eventPastePreviewActions.activate();
    expect(useEventPastePreviewStore.getState()).toMatchObject({
      isActive: true,
    });
  });

  it("deactivates back to the initial state", () => {
    eventPastePreviewActions.activate();
    eventPastePreviewActions.deactivate();
    expect(useEventPastePreviewStore.getState()).toEqual(
      initialEventPastePreviewState,
    );
  });
});
