import classNames from "classnames";
import { type PropsWithChildren } from "react";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { BottomNoticeToastHost } from "@web/components/BottomNoticeStack/BottomNoticeToastHost";
import { useFlushPendingShellToast } from "@web/components/BottomNoticeStack/useFlushPendingShellToast";
import {
  selectIsSidebarOpen,
  useViewStore,
} from "@web/events/stores/view.store";

/** Bottom-left stack for react-toastify and floating notice cards. */
export function BottomNoticeStack({ children }: PropsWithChildren) {
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  // Lift cards and toasts above the sidebar footer whenever the panel is open.
  // On narrow viewports the stack spans nearly the full width, so leaving it
  // at the default bottom inset covers footer actions and blocks pointer hits.
  const clearsSidebarFooter = isSidebarOpen;
  useFlushPendingShellToast();

  return (
    <section
      aria-label="Notifications"
      className={classNames(
        "compass-bottom-notice-stack pointer-events-none fixed flex flex-col items-stretch justify-end gap-3",
        clearsSidebarFooter && "compass-bottom-notice-stack--clears-footer",
      )}
      data-clears-sidebar-footer={clearsSidebarFooter || undefined}
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <BottomNoticeToastHost />
      {children}
    </section>
  );
}
