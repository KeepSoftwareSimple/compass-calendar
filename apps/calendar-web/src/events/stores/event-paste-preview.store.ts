import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export type EventPastePreviewState = {
  isActive: boolean;
  /** When true, Esc or successful paste also turns event-jump mode off. */
  ownsEventJump: boolean;
};

export const initialEventPastePreviewState: EventPastePreviewState = {
  isActive: false,
  ownsEventJump: false,
};

export const useEventPastePreviewStore = create<EventPastePreviewState>()(
  devtools(() => initialEventPastePreviewState, {
    name: "compass/event-paste-preview",
    enabled: IS_DEV,
  }),
);

export const eventPastePreviewActions = {
  activate: (ownsEventJump: boolean) =>
    useEventPastePreviewStore.setState(
      { isActive: true, ownsEventJump },
      false,
      { type: "activate" },
    ),
  deactivate: () =>
    useEventPastePreviewStore.setState(initialEventPastePreviewState, false, {
      type: "deactivate",
    }),
};

export const selectEventPastePreviewActive = (state: EventPastePreviewState) =>
  state.isActive;

export const isEventPastePreviewActive = () =>
  useEventPastePreviewStore.getState().isActive;
