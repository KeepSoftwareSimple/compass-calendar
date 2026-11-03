import classNames from "classnames";
import { type PropsWithChildren, useLayoutEffect, useRef } from "react";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { BottomNoticeToastHost } from "@web/components/BottomNoticeStack/BottomNoticeToastHost";
import { bottomNoticeStackGateActions } from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.store";
import { flushQueuedBottomNoticeToasts } from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.toast";
import { useBottomNoticeStackLift } from "@web/components/BottomNoticeStack/useBottomNoticeStackLift";
import { useFlushPendingShellToast } from "@web/components/BottomNoticeStack/useFlushPendingShellToast";
import {
  selectIsSidebarOpen,
  useViewStore,
} from "@web/events/stores/view.store";

/** Bottom-left stack for react-toastify and floating notice cards. */
export function BottomNoticeStack({
  children,
  suppressed = false,
}: PropsWithChildren<{ suppressed?: boolean }>) {
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  const stackRef = useRef<HTMLElement>(null);
  const { clearsSidebarFooter, upNextBannerClearancePx } =
    useBottomNoticeStackLift(stackRef, isSidebarOpen, !suppressed);

  useFlushPendingShellToast();

  useLayoutEffect(() => {
    bottomNoticeStackGateActions.setSuppressed(suppressed);
    if (suppressed) return;
    flushQueuedBottomNoticeToasts();
  }, [suppressed]);

  if (suppressed) {
    return null;
  }

  return (
    <section
      ref={stackRef}
      aria-label="Notifications"
      className={classNames(
        "compass-bottom-notice-stack pointer-events-none fixed flex flex-col items-stretch justify-end gap-3",
        clearsSidebarFooter && "compass-bottom-notice-stack--clears-footer",
      )}
      data-clears-sidebar-footer={clearsSidebarFooter || undefined}
      data-clears-up-next-banner={
        upNextBannerClearancePx === null ? undefined : true
      }
      style={{
        zIndex: Z_INDEX_TOOLTIP,
        ...(upNextBannerClearancePx === null
          ? {}
          : {
              bottom: `max(${
                clearsSidebarFooter
                  ? "calc(5rem + max(1rem, env(safe-area-inset-bottom)))"
                  : "max(1rem, env(safe-area-inset-bottom))"
              }, ${upNextBannerClearancePx}px)`,
            }),
      }}
    >
      <BottomNoticeToastHost />
      {children}
    </section>
  );
}
