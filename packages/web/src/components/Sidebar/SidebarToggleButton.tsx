import { type FC } from "react";
import { colors } from "@web/common/styles/colors";
import { SidebarIcon } from "@web/components/Icons/Sidebar";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import {
  focusSidebarControl,
  SIDEBAR_DISMISS_CONTROL,
  SIDEBAR_TOGGLE_CONTROL,
} from "./util/sidebarControlFocus.util";

/**
 * Shared open/close control for the right sidebar. Lives in the calendar
 * header; on narrow viewports SidebarShell also hosts a close control so the
 * panel can be dismissed when this header control is hard to reach.
 */
export const SidebarToggleButton: FC = () => {
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);

  return (
    <TooltipWrapper
      description={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
      onClick={() => {
        const willOpen = !isSidebarOpen;
        viewActions.toggleSidebar();
        if (!willOpen) return;
        // On narrow layouts the header control can be clipped once the panel
        // opens; move focus to the in-sidebar dismiss control when present.
        focusSidebarControl(SIDEBAR_DISMISS_CONTROL);
      }}
      shortcut="]"
    >
      <button
        type="button"
        aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        data-sidebar-control={SIDEBAR_TOGGLE_CONTROL}
        className="c-focus-ring flex h-6 w-6 cursor-pointer items-center justify-center"
      >
        <SidebarIcon color={colors.textMuted} size={21} />
      </button>
    </TooltipWrapper>
  );
};
