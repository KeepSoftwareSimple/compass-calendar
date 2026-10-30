import classNames from "classnames";
import { type PropsWithChildren } from "react";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { BottomNoticeToastHost } from "@web/components/BottomNoticeStack/BottomNoticeToastHost";
import { useIsNarrowSidebarLayout } from "@web/components/Sidebar/hooks/useIsNarrowSidebarLayout";
import {
  selectIsSidebarOpen,
  useViewStore,
} from "@web/events/stores/view.store";

/** Bottom-left stack for react-toastify and floating notice cards. */
export function BottomNoticeStack({ children }: PropsWithChildren) {
  const isNarrowLayout = useIsNarrowSidebarLayout();
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  const clearsSidebarFooter = !isNarrowLayout && isSidebarOpen;

  return (
    <section
      aria-label="Notifications"
      className={classNames(
        "compass-bottom-notice-stack pointer-events-none fixed flex flex-col-reverse items-stretch gap-3",
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
