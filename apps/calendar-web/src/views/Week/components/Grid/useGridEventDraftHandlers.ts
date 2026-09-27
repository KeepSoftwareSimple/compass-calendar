import { useCallback } from "react";
import { type Event } from "@core/types/event.contracts";
import { type GridEvent } from "@web/common/types/web.event.types";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";

/**
 * How the timed grid and the all-day row both open a card in the sidebar
 * form. Cards are projections of `weekEvents`, so the draft is rebuilt from
 * the source event they were derived from.
 *
 * startGridDraft derives eventType from the schedule, so neither caller
 * passes a category. keyboardEdit and gridClick both open the form.
 */
export const useGridEventDraftHandlers = (weekEvents: Event[]) => {
  const gridDraftFor = useCallback(
    (event: GridEvent) => {
      const sourceEvent = weekEvents.find(
        (candidate) => candidate.id === event._id,
      );
      return sourceEvent ? editGridEventDraft(sourceEvent) : null;
    },
    [weekEvents],
  );

  const onEventKeyDown = useCallback(
    (event: GridEvent) => {
      const draft = gridDraftFor(event);
      if (!draft) return;

      draftActions.startGridDraft({ activity: "keyboardEdit", draft });
    },
    [gridDraftFor],
  );

  // Read-only cards never reach the keyboard path (they get no interaction
  // attributes), so they open the same form through the click activity and
  // ask for it directly.
  const onOpenReadOnlyDetails = useCallback(
    (event: GridEvent) => {
      const draft = gridDraftFor(event);
      if (!draft) return;

      draftActions.startGridDraft({ activity: "gridClick", draft });
    },
    [gridDraftFor],
  );

  return { onEventKeyDown, onOpenReadOnlyDetails };
};
