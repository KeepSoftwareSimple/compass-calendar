import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { type Event } from "@core/types/event.contracts";
import { IS_DEV } from "@web/common/constants/env.constants";

export type EventClipboardState = {
  event: Event | null;
};

export const initialEventClipboardState: EventClipboardState = {
  event: null,
};

export const useEventClipboardStore = create<EventClipboardState>()(
  devtools(() => initialEventClipboardState, {
    name: "compass/event-clipboard",
    enabled: IS_DEV,
  }),
);

export const eventClipboardActions = {
  /** Snapshot `event` so later edits or deletes of the original do not change what pastes. */
  copy: (event: Event) =>
    useEventClipboardStore.setState({ event: structuredClone(event) }, false, {
      type: "copy",
    }),
  clear: () =>
    useEventClipboardStore.setState(initialEventClipboardState, false, {
      type: "clear",
    }),
};
