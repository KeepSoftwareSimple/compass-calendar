import { isEventFormOpen } from "@web/events/stores/draft.store";
import { isAppLocked } from "@web/shortcuts/app-lock";
import { isFloatingLayerOpen } from "@web/shortcuts/floating-layer";

/** True when Escape should dismiss a modal/form/layer before lower-priority handlers. */
export function isHigherEscapeOwner(): boolean {
  return isAppLocked() || isFloatingLayerOpen() || isEventFormOpen();
}
