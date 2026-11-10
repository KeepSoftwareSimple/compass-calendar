import { isCalendarOnlyDatePickerHintId } from "@core/shortcuts/sidebar-hint-surface";
import { endEventPastePreview } from "@web/events/paste-preview/event-paste-preview.lifecycle";
import { draftActions } from "@web/events/stores/draft.store";
import { edgeFocusActions } from "@web/grid/shortcuts/edge-focus.store";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import {
  datePickerHintActions,
  useDatePickerHintStore,
} from "@web/shortcuts/tips/date-picker-hint.store";
/**
 * Clears grid drafts and transient calendar-grid modes that cannot be acted on
 * once the user leaves the day/week grid (including Life view).
 */
export function suspendCalendarGridInteraction(): void {
  draftActions.discard();
  endEventPastePreview();
  eventJumpActions.reset();
  edgeFocusActions.reset();

  const stack = useDatePickerHintStore.getState().stack;
  for (const surface of stack) {
    if (isCalendarOnlyDatePickerHintId(surface.id)) {
      datePickerHintActions.pop(surface.id);
    }
  }
}
