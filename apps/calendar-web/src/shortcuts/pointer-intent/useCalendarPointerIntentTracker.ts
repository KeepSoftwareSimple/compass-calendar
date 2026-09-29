import { useEffect } from "react";
import { isMobileOS } from "@web/common/utils/device/device.util";

/** Mount grid pointer-intent listeners on calendar routes (keeps the boot set small). */
export function useCalendarPointerIntentTracker(): void {
  useEffect(() => {
    if (isMobileOS()) return;
    let detach: (() => void) | undefined;
    void import(
      "@web/shortcuts/pointer-intent/attachPointerIntentTracker"
    ).then(({ attachPointerIntentTracker }) => {
      detach = attachPointerIntentTracker();
    });
    return () => {
      detach?.();
    };
  }, []);
}
