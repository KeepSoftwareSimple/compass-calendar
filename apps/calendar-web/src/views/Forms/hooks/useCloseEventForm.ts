import { useCallback } from "react";
import { focusCalendarEventElementAfterDiscard } from "@web/common/utils/event/event.util";
import {
  draftActions,
  selectDraftId,
  useDraftStore,
} from "@web/events/stores/draft.store";

export function useCloseEventForm() {
  return useCallback((focusEventId?: string) => {
    const eventId =
      typeof focusEventId === "string"
        ? focusEventId
        : selectDraftId(useDraftStore.getState());
    draftActions.discard();
    if (eventId) {
      focusCalendarEventElementAfterDiscard(eventId);
    }
  }, []);
}
