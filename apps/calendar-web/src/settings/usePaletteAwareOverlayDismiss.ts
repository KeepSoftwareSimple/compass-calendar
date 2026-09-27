import { useEffect, useRef } from "react";
import {
  reopenCommandPaletteIfNeeded,
  useSettingsStore,
} from "@web/settings/settings.store";

/**
 * Overlay hosts that can return to the command palette share this dismiss
 * path: skip OverlayPanel's trigger restore when the palette will remount,
 * then reopen if the overlay was opened from it.
 */
export function usePaletteAwareOverlayDismiss(
  isOpen: boolean,
  close: () => void,
) {
  const skipFocusRestoreRef = useRef(false);

  useEffect(() => {
    if (isOpen) skipFocusRestoreRef.current = false;
  }, [isOpen]);

  const handleDismiss = () => {
    skipFocusRestoreRef.current =
      useSettingsStore.getState().overlayOpenedFromPalette;
    reopenCommandPaletteIfNeeded(close);
  };

  return { skipFocusRestoreRef, handleDismiss };
}
