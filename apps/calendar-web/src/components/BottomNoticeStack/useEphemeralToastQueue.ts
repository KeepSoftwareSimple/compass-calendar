import { useEffect, useState } from "react";
import { getToast } from "@web/common/utils/toast/toast.port";
import { BOTTOM_NOTICE_QUEUE_ID } from "@web/components/BottomNoticeStack/bottom-notice.constants";
import { useBottomNoticeQueue } from "@web/components/BottomNoticeStack/useBottomNoticeQueue";

function countVisibleEphemeralToasts(): boolean {
  return (
    document.querySelectorAll(
      ".compass-bottom-notice-stack__toasts .Toastify__toast",
    ).length > 0
  );
}

/** True when a react-toastify toast may occupy the bottom-left slot. */
export function useEphemeralToastQueue(): boolean {
  const [hasToast, setHasToast] = useState(false);

  useEffect(() => {
    const sync = () => setHasToast(countVisibleEphemeralToasts());
    sync();
    return getToast().onChange(sync);
  }, []);

  return useBottomNoticeQueue(BOTTOM_NOTICE_QUEUE_ID.ephemeralToast, hasToast);
}
