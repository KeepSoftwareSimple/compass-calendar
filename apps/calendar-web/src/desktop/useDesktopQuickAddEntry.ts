import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import {
  DESKTOP_QUICK_ADD_SEARCH_PARAM,
  type DesktopQuickAddSearch,
  isDesktopQuickAddRequested,
} from "@web/desktop/desktop-quick-add.search";
import { beginDesktopQuickAddSession } from "@web/desktop/desktop-quick-add.session";
import { isDesktop } from "@web/desktop/isDesktop";
import { settingsActions } from "@web/settings/settings.store";

/**
 * Opens the command palette in create mode when the macOS quick-add panel
 * loads `/?quickAdd=1`. Ignored outside the desktop shell.
 */
export function useDesktopQuickAddEntry() {
  const search = useSearch({ strict: false }) as DesktopQuickAddSearch;
  const navigate = useNavigate();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!isDesktop() || consumedRef.current) return;
    if (!isDesktopQuickAddRequested(search)) return;
    consumedRef.current = true;
    beginDesktopQuickAddSession();
    settingsActions.openCmdPaletteCreateMode();
    void navigate({
      to: ".",
      replace: true,
      search: (prev: DesktopQuickAddSearch) => {
        const next = { ...prev };
        delete next[DESKTOP_QUICK_ADD_SEARCH_PARAM];
        return next;
      },
    });
  }, [navigate, search]);
}
