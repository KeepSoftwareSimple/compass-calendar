import { createElement } from "react";
import { type Id } from "react-toastify";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { calendarDelayedToastMessage } from "@web/auth/providers/connect.util";
import { useConnectGoogle } from "@web/auth/providers/useConnectProvider";
import {
  rememberPendingDelayed,
  shouldDeferAttentionToasts,
  takePendingDelayed,
} from "@web/billing/billing-gate-attention";
import { PROVIDER_DELAYED_TOAST_ID } from "@web/common/constants/toast.constants";
import {
  ErrorToastSeverity,
  showErrorToast,
} from "@web/common/utils/toast/error-toast.util";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { CONNECTION_BANNER_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

interface ProviderDelayedToastProps {
  toastId: Id;
  connection?: SyncConnectionSummary | null;
}

export const ProviderDelayedToast = ({
  toastId,
  connection,
}: ProviderDelayedToastProps) => {
  const { refresh } = useConnectGoogle();
  const { title, body } = connection
    ? calendarDelayedToastMessage(connection)
    : {
        title: "Calendar updates are delayed",
        body: "Updates are taking longer than expected. Compass will keep trying.",
      };

  const handleRefresh = () => {
    getToast().dismiss(toastId);
    refresh();
  };

  return (
    <ToastNotice>
      <p className="font-medium text-sm text-text">{title}</p>
      <p className="text-sm text-text">{body}</p>
      <ToastActionButton
        onClick={handleRefresh}
        shortcutKey={CONNECTION_BANNER_SHORTCUT_KEY}
      >
        Refresh calendar
      </ToastActionButton>
    </ToastNotice>
  );
};

export function showProviderDelayedToast(
  connection?: SyncConnectionSummary | null,
): Id {
  if (shouldDeferAttentionToasts()) {
    rememberPendingDelayed();
    return PROVIDER_DELAYED_TOAST_ID;
  }

  return showErrorToast(
    createElement(ProviderDelayedToast, {
      toastId: PROVIDER_DELAYED_TOAST_ID,
      connection,
    }),
    {
      toastId: PROVIDER_DELAYED_TOAST_ID,
      severity: ErrorToastSeverity.CRITICAL,
    },
  );
}

export function deferProviderDelayedToastIfVisible(): void {
  const toast = getToast();
  if (toast.isActive?.(PROVIDER_DELAYED_TOAST_ID) !== true) return;

  rememberPendingDelayed();
  dismissProviderDelayedToast();
}

export function flushDeferredProviderDelayedToast(
  connection?: SyncConnectionSummary | null,
): void {
  if (!takePendingDelayed()) return;
  showProviderDelayedToast(connection);
}

export function dismissProviderDelayedToast(): void {
  getToast().dismiss(PROVIDER_DELAYED_TOAST_ID);
}
