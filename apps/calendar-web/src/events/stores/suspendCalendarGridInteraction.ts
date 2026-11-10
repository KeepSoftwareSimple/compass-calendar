import { isCalendarOnlyDatePickerHintId } from "@core/shortcuts/sidebar-hint-surface";
import { endEventPastePreview } from "@web/events/paste-preview/event-paste-preview.lifecycle";
import {
  draftActions,
  type Status_DraftEvent,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { edgeFocusActions } from "@web/grid/shortcuts/edge-focus.store";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import {
  datePickerHintActions,
  useDatePickerHintStore,
} from "@web/shortcuts/tips/date-picker-hint.store";

function isFormClosedPlacementDraft(status: Status_DraftEvent | null): boolean {
  if (!status?.isDrafting || status.isFormOpen) return false;
  return (
    status.activity === "keyboardPlace" || status.activity === "pastePlace"
  );
}

/**
 * Clears grid drafts and transient calendar-grid modes that cannot be acted on
 * once the user leaves the day/week grid (including Life view).
 */
export function suspendCalendarGridInteraction(): void {
  const status = useDraftStore.getState().status;
  if (isFormClosedPlacementDraft(status)) {
    if (status?.activity === "pastePlace") {
      endEventPastePreview();
    } else {
      draftActions.discard();
    }
  } else {
    endEventPastePreview();
  }
  eventJumpActions.reset();
  edgeFocusActions.reset();

  const stack = useDatePickerHintStore.getState().stack;
  for (const surface of stack) {
    if (isCalendarOnlyDatePickerHintId(surface.id)) {
      datePickerHintActions.pop(surface.id);
    }
  }
}
