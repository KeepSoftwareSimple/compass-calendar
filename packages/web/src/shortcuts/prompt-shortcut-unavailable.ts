import { type Id } from "react-toastify";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";

export const SHORTCUT_UNAVAILABLE_TOAST_ID: Id = "shortcut-unavailable-overlay";

export const EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE =
  "Shortcut unavailable while editing an event (press Esc to close)";

/** One status toast for a blocked shortcut so repeated presses do not stack. */
export function promptShortcutUnavailable(message: string): void {
  showStatusToast(SHORTCUT_UNAVAILABLE_TOAST_ID, message);
}

export function promptShortcutUnavailableWhileEditingEvent(): void {
  promptShortcutUnavailable(EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE);
}
