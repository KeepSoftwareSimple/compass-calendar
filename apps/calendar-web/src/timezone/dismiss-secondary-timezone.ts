import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import {
  getTimeTravelZone,
  setTimeTravelZone,
} from "@web/timezone/time-travel.store";

export const SECONDARY_TIMEZONE_HIDDEN_TOAST_ID = "secondary-timezone-hidden";

/** Clears the secondary hour column and confirms with a status toast. */
export function dismissSecondaryTimeZone(): boolean {
  const hadSecondary = getTimeTravelZone() !== null;
  const cleared = setTimeTravelZone(null);
  if (cleared && hadSecondary) {
    showStatusToast(
      SECONDARY_TIMEZONE_HIDDEN_TOAST_ID,
      "Second timezone hidden",
    );
  }
  return cleared;
}
