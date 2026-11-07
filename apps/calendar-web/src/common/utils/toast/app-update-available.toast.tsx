import { createElement } from "react";
import { type Id } from "react-toastify";
import {
  APP_UPDATE_AVAILABLE_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import { deliverOrQueueBottomNoticeToast } from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.toast";
import { NoticeDismissButton } from "@web/components/BottomNoticeStack/NoticeDismissButton";
import { NoticePrimaryButton } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import {
  APP_UPDATE_RELOAD_SHORTCUT,
  useReloadAppShortcut,
} from "@web/components/Sidebar/SidebarActions/useReloadAppShortcut";

export const APP_UPDATE_TOAST_MESSAGE =
  "Compass just got better. Refresh to update.";

export const APP_UPDATE_REFRESH_LABEL = "Refresh";

export function AppUpdateAvailableToast({
  toastId = APP_UPDATE_AVAILABLE_TOAST_ID,
}: {
  toastId?: Id;
}) {
  useReloadAppShortcut(true);

  const dismiss = () => {
    getToast().dismiss(toastId);
  };

  return (
    <div className="flex w-full flex-col gap-3 text-text" data-notice="">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          {APP_UPDATE_TOAST_MESSAGE}
        </p>
        <NoticeDismissButton
          ariaLabel="Dismiss update notice"
          onClick={dismiss}
        />
      </div>
      <NoticePrimaryButton
        onClick={() => {
          reloadLocation();
        }}
        shortcutKeys={[...APP_UPDATE_RELOAD_SHORTCUT]}
      >
        {APP_UPDATE_REFRESH_LABEL}
      </NoticePrimaryButton>
    </div>
  );
}

export function showAppUpdateAvailableToast(_version: string): Id {
  const toastId = APP_UPDATE_AVAILABLE_TOAST_ID;

  return deliverOrQueueBottomNoticeToast(
    createElement(AppUpdateAvailableToast, { toastId }),
    {
      ...getToastDefaultOptions(),
      toastId,
      autoClose: false,
      closeOnClick: false,
      className: "app-update-available-toast-host",
    },
  );
}
