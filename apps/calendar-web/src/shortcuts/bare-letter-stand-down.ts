import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import { isAppLocked } from "@web/shortcuts/app-lock";
import { isEventJumpActive } from "@web/shortcuts/shift-hint/event-jump.store";
import { isEditSequenceArmed } from "@web/shortcuts/useEditSequenceShortcut";

/**
 * Shared yield for capture-phase bare-letter shortcuts (`f` focus-notice,
 * `m` event menu). Stands down while the app is locked, the user is typing,
 * an `e`… sequence is armed, or event-jump chips own the letters.
 */
export const shouldStandDownBareLetterShortcut = (
  event: KeyboardEvent,
): boolean =>
  isAppLocked() ||
  isEditableKeyboardTarget(event) ||
  isEditSequenceArmed() ||
  isEventJumpActive();
