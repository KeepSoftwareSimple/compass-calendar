import { useLayoutEffect } from "react";
import { bottomNoticeStackGateActions } from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.store";

/** Keep bottom-notice toast queuing in sync when the stack host unmounts. */
export function useBottomNoticeStackGateSync(suppressed: boolean): void {
  useLayoutEffect(() => {
    bottomNoticeStackGateActions.setSuppressed(suppressed);
  }, [suppressed]);
}
