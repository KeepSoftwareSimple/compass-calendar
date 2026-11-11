import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export type EventPastePreviewState = {
  isActive: boolean;
};

export const initialEventPastePreviewState: EventPastePreviewState = {
  isActive: false,
};

export const useEventPastePreviewStore = create<EventPastePreviewState>()(
  devtools(() => initialEventPastePreviewState, {
    name: "compass/event-paste-preview",
    enabled: IS_DEV,
  }),
);

export const eventPastePreviewActions = {
  activate: () =>
    useEventPastePreviewStore.setState({ isActive: true }, false, {
      type: "activate",
    }),
  deactivate: () =>
    useEventPastePreviewStore.setState(initialEventPastePreviewState, false, {
      type: "deactivate",
    }),
};

export const selectEventPastePreviewActive = (state: EventPastePreviewState) =>
  state.isActive;

export const isEventPastePreviewActive = () =>
  useEventPastePreviewStore.getState().isActive;
