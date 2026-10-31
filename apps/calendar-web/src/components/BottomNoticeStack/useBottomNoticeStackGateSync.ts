import { useLayoutEffect } from "react";
import { bottomNoticeStackGateActions } from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.store";
import { ensureBottomNoticeStackToastGate } from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.toast";

/** Keep toast queuing in sync when the stack host unmounts while suppressed. */
export function useBottomNoticeStackGateSync(suppressed: boolean): void {
  ensureBottomNoticeStackToastGate();

  useLayoutEffect(() => {
    bottomNoticeStackGateActions.setSuppressed(suppressed);
  }, [suppressed]);
}
