import { useCallback } from "react";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { useDefaultTargetCalendar } from "@web/calendars/useDefaultTargetCalendar";
import { duplicateGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { commitDuplicateEvent } from "@web/events/mutations/duplicate-event";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import { useEventById } from "@web/events/queries/useEventById";
import { draftActions } from "@web/events/stores/draft.store";

/**
 * Duplicates an existing event as a new saved event (preserves series
 * rules). Falls back to opening a create draft only when no writable
 * calendar can be resolved for the copy.
 */
export function useDuplicateEvent(_id: string) {
  const event = useEventById(_id);
  const { data: calendars } = useCalendarsQuery();
  const defaultCalendar = useDefaultTargetCalendar(calendars ?? []);
  const { create } = useEventMutations();

  const duplicateEvent = useCallback(() => {
    if (!event) return;

    // Discards directly (not useCloseEventForm) - that hook's
    // refocus-to-source-event would race commitDuplicateEvent's own
    // focus-the-new-card call, and either the fallback below opens a new
    // form (making a refocus pointless) or the commit succeeds and owns
    // focus itself.
    draftActions.discard();

    const committed = commitDuplicateEvent({
      source: event,
      calendars: calendars ?? [],
      defaultCalendarId: defaultCalendar?.id,
      create,
    });
    if (committed) return;

    const duplicate = duplicateGridEventDraft(event, calendars ?? []);
    if (!duplicate) return;

    draftActions.startGridDraft({ activity: "gridClick", draft: duplicate });
  }, [calendars, create, defaultCalendar?.id, event]);

  return duplicateEvent;
}
