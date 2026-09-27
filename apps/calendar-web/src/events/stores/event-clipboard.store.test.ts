import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import {
  eventClipboardActions,
  initialEventClipboardState,
  useEventClipboardStore,
} from "@web/events/stores/event-clipboard.store";
import { beforeEach, describe, expect, it } from "bun:test";

describe("event-clipboard.store", () => {
  beforeEach(() => {
    useEventClipboardStore.setState(initialEventClipboardState, true);
  });

  it("snapshots the event so later mutations of the source do not change the clipboard", () => {
    const source = createMockEvent({
      content: { kind: "details", title: "Original", description: "" },
    });

    eventClipboardActions.copy(source);
    const live = source as {
      content: { kind: "details"; title: string; description: string };
    };
    live.content.title = "Edited";

    expect(useEventClipboardStore.getState().event?.content).toEqual({
      kind: "details",
      title: "Original",
      description: "",
    });
  });

  it("overwrites the clipboard with the latest copy", () => {
    const first = createMockEvent({
      content: { kind: "details", title: "First", description: "" },
    });
    const second = createMockEvent({
      content: { kind: "details", title: "Second", description: "" },
    });

    eventClipboardActions.copy(first);
    eventClipboardActions.copy(second);

    expect(useEventClipboardStore.getState().event?.content).toEqual({
      kind: "details",
      title: "Second",
      description: "",
    });
  });

  it("keeps the snapshot until the next copy or clear: no TTL", () => {
    const source = createMockEvent({
      content: { kind: "details", title: "Kept", description: "" },
    });

    eventClipboardActions.copy(source);

    expect(useEventClipboardStore.getState().event?.id).toBe(source.id);

    eventClipboardActions.clear();
    expect(useEventClipboardStore.getState().event).toBeNull();
  });
});
