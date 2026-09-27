import { useQueryClient } from "@tanstack/react-query";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  type EventFormFocusField,
  focusEventFormField,
  getEventFormElement,
} from "@web/common/utils/form/form.util";
import { createGridEventDraftFromGridEvent } from "@web/events/grid-event-draft.adapter";
import { findEventInCache } from "@web/events/queries/event.query.cache";
import {
  draftActions,
  isEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  type FocusableGridEventTarget,
  findCalendarEventForTarget,
} from "@web/grid/shortcuts/focus-adjacent-grid-event";
import { useEditSequenceShortcut } from "@web/shortcuts/useEditSequenceShortcut";

const focusFieldAfterPaint = (field: EventFormFocusField) => {
  // Wait two paints so sequences other than title land after the title's
  // autoFocus, then retry across frames: the form mounts through a lazy
  // boundary (EventForm.lazy.ts), so on a cold cache the field can be a
  // chunk fetch away, not just a commit away.
  let attempts = 0;
  const tryFocus = () => {
    if (focusEventFormField(field)) return;
    if (++attempts < 30) requestAnimationFrame(tryFocus);
  };
  requestAnimationFrame(() => {
    requestAnimationFrame(tryFocus);
  });
};

/**
 * `e` (or `Mod+E` while typing) then `t`/`l`/`d`/`s`/`e`/`r`/`a`/`c`/`g`: open
 * the focused event's form (if needed) and move caret/focus to the matching
 * field. Shared by Day and Week.
 *
 * Returns the anchor resolver for the which-key menu: the focused card while
 * the sequence starts from the grid, else the docked form, which is where the
 * caret is for the `Mod+E` path.
 */
export function useGridEventFormFieldSequences({
  allDayEvents = [],
  targeting,
  timedEvents,
}: {
  allDayEvents?: GridEvent[];
  targeting: {
    getFocused: () => FocusableGridEventTarget | null;
  };
  timedEvents: GridEvent[];
}) {
  const queryClient = useQueryClient();

  const draftAlreadyOpenForEvent = (eventId: string) => {
    if (!isEventFormOpen()) return false;
    const draft = useDraftStore.getState().gridDraft;
    if (!draft) return false;
    if (draft.kind === "edit") {
      return draft.source.id === eventId;
    }
    return draft.clientId === eventId;
  };

  const openFocusedEventFormField = (field: EventFormFocusField) => {
    const target = targeting.getFocused();

    // Started from inside the open form (Mod+E): no card is focused, so jump
    // straight to the field rather than trying to reopen anything.
    if (!target) {
      if (isEventFormOpen()) {
        focusEventFormField(field);
      }
      return;
    }

    const gridEvent = findCalendarEventForTarget(target, {
      allDayEvents,
      timedEvents,
    });
    if (!gridEvent?._id) return;

    if (!draftAlreadyOpenForEvent(gridEvent._id)) {
      const sourceEvent = findEventInCache(queryClient, gridEvent._id);
      const draft = createGridEventDraftFromGridEvent(gridEvent, sourceEvent);
      if (!draft) return;

      draftActions.startGridDraft({ activity: "keyboardEdit", draft });
      focusFieldAfterPaint(field);
      return;
    }

    focusEventFormField(field);
  };

  // Plain functions, not useCallback: `targeting` is rebuilt every render by
  // the owners, so memoizing on it would be a lie. The hook reads both through
  // refs, and the menu only calls the anchor getter during render.
  const canArm = () => targeting.getFocused() !== null || isEventFormOpen();

  const getMenuAnchor = () =>
    targeting.getFocused()?.element ?? getEventFormElement();

  useEditSequenceShortcut({
    canArm,
    onSequence: openFocusedEventFormField,
  });

  return { getMenuAnchor };
}
