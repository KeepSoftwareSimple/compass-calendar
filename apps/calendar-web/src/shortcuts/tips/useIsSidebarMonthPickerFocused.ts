import { useEffect, useState } from "react";
import { isSidebarMonthPickerFocused } from "@web/shortcuts/tips/isSidebarMonthPickerFocused";

/** Tracks whether the sidebar month picker owns document focus. */
export function useIsSidebarMonthPickerFocused(): boolean {
  const [focused, setFocused] = useState(() =>
    isSidebarMonthPickerFocused(document.activeElement),
  );

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setFocused(isSidebarMonthPickerFocused(document.activeElement));
      });
    };

    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", sync);
    sync();

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", sync);
    };
  }, []);

  return focused;
}
