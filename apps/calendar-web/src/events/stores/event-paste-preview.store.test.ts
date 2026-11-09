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

  it("activates and records whether jump mode was already on", () => {
    eventPastePreviewActions.activate(true);
    expect(useEventPastePreviewStore.getState()).toMatchObject({
      isActive: true,
      ownsEventJump: true,
    });
  });

  it("deactivates back to the initial state", () => {
    eventPastePreviewActions.activate(false);
    eventPastePreviewActions.deactivate();
    expect(useEventPastePreviewStore.getState()).toEqual(
      initialEventPastePreviewState,
    );
  });
});
