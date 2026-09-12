import { type Id } from "react-toastify";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { type ShortcutHintId } from "@web/shortcuts/tips/shortcut-tips.data";

export const SHORTCUT_UNAVAILABLE_TOAST_ID: Id = "shortcut-unavailable-overlay";

export const EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE =
  "Shortcut unavailable while editing an event (press Esc to close)";

const OVERLAY_UNAVAILABLE_MESSAGES: Partial<Record<ShortcutHintId, string>> = {
  "create-event": "Close this panel to create an event (C)",
  "edge-focus": "Close this panel to use edge focus (Tab)",
  nudge: "Close this panel to move an event (Shift and arrow keys)",
};

/** Explains every tracked shortcut that is blocked by a non-billing overlay. */
export function getOverlayUnavailableMessage(hintId: ShortcutHintId): string {
  return (
    OVERLAY_UNAVAILABLE_MESSAGES[hintId] ??
    "Close this panel to use this shortcut"
  );
}

/** One status toast for a blocked shortcut so repeated presses do not stack. */
export function promptShortcutUnavailable(message: string): void {
  showStatusToast(SHORTCUT_UNAVAILABLE_TOAST_ID, message);
}

export function promptShortcutUnavailableWhileEditingEvent(): void {
  promptShortcutUnavailable(EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE);
}
