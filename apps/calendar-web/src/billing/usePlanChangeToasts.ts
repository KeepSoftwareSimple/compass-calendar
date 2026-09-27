import { useEffect, useRef } from "react";
import { type AppAccess, useAppAccess } from "@web/billing/useAppAccess";
import { BILLING_SUBSCRIBED_TOAST_ID } from "@web/common/constants/toast.constants";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";

const isTrialingAccess = (access: AppAccess): boolean =>
  access.kind === "server" && access.status === "trialing";

const isActiveAccess = (access: AppAccess): boolean =>
  access.kind === "server" && access.status === "active";

/**
 * When a trial becomes a paid subscription (webhook or in-app end-trial),
 * say so. The toast id matches the in-app upgrade so rapid
 * duplicate reports collapse to one chip.
 */
export function usePlanChangeToasts() {
  const access = useAppAccess();
  const previousRef = useRef(access);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = access;
    if (isTrialingAccess(previous) && isActiveAccess(access)) {
      showStatusToast(BILLING_SUBSCRIBED_TOAST_ID, "You're subscribed");
    }
  }, [access]);
}
