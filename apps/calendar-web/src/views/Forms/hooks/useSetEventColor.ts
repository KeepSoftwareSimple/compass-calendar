import { useCallback } from "react";
import { type EventColorSlot } from "@core/types/event-color.contracts";
import {
  editGridEventDraft,
  parseGridEventDraft,
  patchGridDraftFields,
} from "@web/events/grid-event-draft.adapter";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import { useEventById } from "@web/events/queries/useEventById";
import { draftActions } from "@web/events/stores/draft.store";

/**
 * Immediately replaces an event's color tag (or clears it with null), then
 * discards any right-click / grid draft once the optimistic cache write lands.
 * Used by the event context menu.
 */
export function useSetEventColor(_id: string) {
  const existingEvent = useEventById(_id);
  const { replace } = useEventMutations();

  return useCallback(
    (color: EventColorSlot | null) => {
      if (!existingEvent) return;

      const details =
        existingEvent.content.kind === "details" ? existingEvent.content : null;
      const currentColor = details?.color ?? null;
      // Same slot (or default) is a no-op unless a provider hex is still
      // winning the palette — then this write clears it via replace merge.
      if (currentColor === color && details?.colorHex === undefined) {
        draftActions.discard();
        return;
      }

      const draft = editGridEventDraft(existingEvent);
      if (draft?.kind !== "edit") return;

      const patchedDraft = patchGridDraftFields(draft, { color });
      const parsed = parseGridEventDraft(patchedDraft);
      if (!parsed.ok || parsed.mode !== "edit") {
        draftActions.discard();
        return;
      }

      // Paint the new color on the draft card before replace's async onMutate
      // finishes cancelQueries + optimistic cache write (Day may have no draft
      // yet; Week's right-click draft still holds the old color).
      draftActions.setGridDraft(patchedDraft);
      replace(
        { id: parsed.eventId, input: parsed.input },
        { onOptimisticApplied: () => draftActions.discard() },
      );
    },
    [existingEvent, replace],
  );
}
