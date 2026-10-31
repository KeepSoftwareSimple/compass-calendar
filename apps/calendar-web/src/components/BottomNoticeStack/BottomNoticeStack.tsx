import classNames from "classnames";
import { type PropsWithChildren } from "react";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { AppUpdateAvailableNotice } from "@web/components/BottomNoticeStack/AppUpdateAvailableNotice";
import { BottomNoticeToastHost } from "@web/components/BottomNoticeStack/BottomNoticeToastHost";
import { useFlushPendingShellToast } from "@web/components/BottomNoticeStack/useFlushPendingShellToast";
import { useIsNarrowSidebarLayout } from "@web/components/Sidebar/hooks/useIsNarrowSidebarLayout";
import {
  selectIsSidebarOpen,
  useViewStore,
} from "@web/events/stores/view.store";

/** Bottom-left slot: one prioritized notice at a time. */
export function BottomNoticeStack({ children }: PropsWithChildren) {
  const isNarrowLayout = useIsNarrowSidebarLayout();
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  const clearsSidebarFooter = !isNarrowLayout && isSidebarOpen;
  useFlushPendingShellToast();

  return (
    <section
      aria-label="Notifications"
      className={classNames(
        "compass-bottom-notice-stack pointer-events-none fixed flex flex-col items-stretch justify-end",
        clearsSidebarFooter && "compass-bottom-notice-stack--clears-footer",
      )}
      data-clears-sidebar-footer={clearsSidebarFooter || undefined}
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <AppUpdateAvailableNotice />
      {children}
      <BottomNoticeToastHost />
    </section>
  );
}
