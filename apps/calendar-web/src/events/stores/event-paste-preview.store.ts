import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";
import { type GridEventDraft } from "@web/events/event-draft.types";

export type EventPastePreviewState = {
  placement: GridEventDraft | null;
};

export const initialEventPastePreviewState: EventPastePreviewState = {
  placement: null,
};

export const useEventPastePreviewStore = create<EventPastePreviewState>()(
  devtools(() => initialEventPastePreviewState, {
    name: "compass/event-paste-preview",
    enabled: IS_DEV,
  }),
);

export const eventPastePreviewActions = {
  setPlacement: (placement: GridEventDraft | null) =>
    useEventPastePreviewStore.setState({ placement }, false, {
      type: "setPlacement",
    }),
  deactivate: () => {
    if (isEventPastePreviewActive()) {
      useEventPastePreviewStore.setState(initialEventPastePreviewState, false, {
        type: "deactivate",
      });
    }
  },
};

export const isEventPastePreviewActive = () =>
  useEventPastePreviewStore.getState().placement !== null;
