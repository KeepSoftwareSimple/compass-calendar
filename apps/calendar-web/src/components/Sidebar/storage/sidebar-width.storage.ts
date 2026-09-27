import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  clampSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
} from "@web/components/Sidebar/storage/sidebar-width.constants";

export function readSidebarWidth(): number {
  const stored = persistentBrowserStore.get(STORAGE_KEYS.SIDEBAR_WIDTH);
  if (stored === null) return SIDEBAR_DEFAULT_WIDTH;

  // Drags on zoomed/HiDPI displays produce fractional widths, so tolerate
  // (and heal) any finite stored value instead of resetting to the default.
  const width = Number(stored);
  return Number.isFinite(width)
    ? clampSidebarWidth(Math.round(width))
    : SIDEBAR_DEFAULT_WIDTH;
}

export function writeSidebarWidth(width: number): void {
  persistentBrowserStore.set(
    STORAGE_KEYS.SIDEBAR_WIDTH,
    String(Math.round(width)),
  );
}
