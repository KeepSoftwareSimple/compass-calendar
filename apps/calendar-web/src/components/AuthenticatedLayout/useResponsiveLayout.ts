import { useLayoutEffect } from "react";
import { useMediaQuery } from "@web/common/hooks/useMediaQuery";
import { SIDEBAR_MIN_WIDTH_MEDIA_QUERY } from "@web/components/AuthenticatedLayout/responsive.constants";
import {
  selectSidebarPreference,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";

/**
 * Syncs sidebar visibility in the view store with the window size. The sidebar
 * auto-collapses below its breakpoint regardless of any saved preference, but
 * reopening above it restores the user's last manual choice (persisted via
 * setSidebarOpen/toggleSidebar), so a breakpoint crossing never overrides a
 * preference a refresh would otherwise honor. Mount once per app
 * (AuthenticatedLayout) so overrides survive view switches.
 */
export function useResponsiveLayout() {
  const isWideEnough = useMediaQuery(SIDEBAR_MIN_WIDTH_MEDIA_QUERY);

  useLayoutEffect(() => {
    viewActions.syncSidebarOpen(
      isWideEnough && selectSidebarPreference(useViewStore.getState()),
    );
  }, [isWideEnough]);
}
