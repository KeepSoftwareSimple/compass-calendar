import { useEffect } from "react";
import { type BottomNoticeQueueId } from "@web/components/BottomNoticeStack/bottom-notice.constants";
import {
  selectActiveBottomNoticeId,
  useBottomNoticeQueueStore,
} from "@web/components/BottomNoticeStack/bottom-notice-queue.store";

/** Register eligibility; only the highest-priority eligible notice may render. */
export function useBottomNoticeQueue(
  id: BottomNoticeQueueId,
  eligible: boolean,
): boolean {
  const setRegistered = useBottomNoticeQueueStore((s) => s.setRegistered);
  const activeId = useBottomNoticeQueueStore(selectActiveBottomNoticeId);

  useEffect(() => {
    setRegistered(id, eligible);
    return () => setRegistered(id, false);
  }, [eligible, id, setRegistered]);

  return eligible && activeId === id;
}
