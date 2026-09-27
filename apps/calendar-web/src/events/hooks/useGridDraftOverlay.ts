import { useMemo } from "react";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDraftToGridEvent } from "@web/events/grid-event-draft.adapter";
import { selectGridDraft, useDraftStore } from "@web/events/stores/draft.store";

export function useGridDraftOverlay(): GridEvent | null {
  const gridDraft = useDraftStore(selectGridDraft);
  return useMemo(
    () => (gridDraft ? gridEventDraftToGridEvent(gridDraft) : null),
    [gridDraft],
  );
}

export function mergeGridEventWithDraftOverlay(
  event: GridEvent,
  draft: GridEvent | null,
): GridEvent {
  if (!draft || event._id !== draft._id) {
    return event;
  }

  return { ...event, ...draft };
}
