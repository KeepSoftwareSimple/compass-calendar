import { createElement } from "react";
import { type Id } from "react-toastify";
import { connectionProvider } from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";
import {
  selectPrimarySyncConnection,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import {
  rememberPendingDelayed,
  shouldDeferAttentionToasts,
  takePendingDelayed,
} from "@web/billing/billing-gate-attention";
import { GOOGLE_DELAYED_TOAST_ID } from "@web/common/constants/toast.constants";
import {
  ErrorToastSeverity,
  showErrorToast,
} from "@web/common/utils/toast/error-toast.util";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";
import { CONNECTION_BANNER_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";

interface GoogleDelayedToastProps {
  toastId: Id;
}

// Shown when Sync reports delayed / soft ATTENTION so returning users get an
// actionable Refresh rather than a dead-end warning. Mirrors the reconnect
// toast layout and delegates to useConnectProvider().refresh().
export const GoogleDelayedToast = ({ toastId }: GoogleDelayedToastProps) => {
  const primary = useUserMetadataStore(selectPrimarySyncConnection);
  const { refresh } = useConnectProvider(connectionProvider(primary), {
    connection: primary,
  });

  const handleRefresh = () => {
    getToast().dismiss(toastId);
    refresh();
  };

  return (
    <ToastNotice>
      <p className="font-medium text-sm text-text">
        Calendar updates are delayed
      </p>
      <p className="text-sm text-text">
        Updates are taking longer than expected. Try Refresh, or reconnect if
        this continues.
      </p>
      <ToastActionButton
        onClick={handleRefresh}
        shortcutKey={CONNECTION_BANNER_SHORTCUT_KEY}
      >
        Refresh calendar
      </ToastActionButton>
    </ToastNotice>
  );
};

export function showGoogleDelayedToast(): Id {
  if (shouldDeferAttentionToasts()) {
    rememberPendingDelayed();
    return GOOGLE_DELAYED_TOAST_ID;
  }

  return showErrorToast(
    createElement(GoogleDelayedToast, { toastId: GOOGLE_DELAYED_TOAST_ID }),
    {
      toastId: GOOGLE_DELAYED_TOAST_ID,
      severity: ErrorToastSeverity.CRITICAL,
    },
  );
}

export function deferGoogleDelayedToastIfVisible(): void {
  const toast = getToast();
  if (toast.isActive?.(GOOGLE_DELAYED_TOAST_ID) !== true) return;

  rememberPendingDelayed();
  dismissGoogleDelayedToast();
}

export function flushDeferredGoogleDelayedToast(): void {
  if (!takePendingDelayed()) return;
  showGoogleDelayedToast();
}

// The toast is CRITICAL severity (autoClose: false, closeOnClick: false) so
// it never disappears on its own - without this, it can sit on screen after
// the connection is healthy again, contradicting its own "delayed" copy.
export function dismissGoogleDelayedToast(): void {
  getToast().dismiss(GOOGLE_DELAYED_TOAST_ID);
}
