import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { createElement } from "react";
import { type Id } from "react-toastify";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import { NoticePrimaryButton } from "@web/components/BottomNoticeStack/NoticePrimaryButton";
import IconButton from "@web/components/IconButton/IconButton";
import { useReloadAppShortcut } from "@web/components/Sidebar/SidebarActions/useReloadAppShortcut";

export const APP_UPDATE_TOAST_MESSAGE =
  "Compass just got better. Refresh to update.";

export const APP_UPDATE_RELOAD_SHORTCUT = ["Mod", "R"] as const;

export const APP_UPDATE_REFRESH_LABEL = "Refresh";

export const appUpdateToastIdForVersion = (version: string): Id =>
  `app-update-${version}`;

export function AppUpdateAvailableToast({ toastId }: { toastId: Id }) {
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
        <IconButton
          aria-label="Dismiss update notice"
          className="shrink-0 text-text-muted hover:text-text"
          onClick={dismiss}
          size="small"
        >
          <XIcon aria-hidden="true" size={14} />
        </IconButton>
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

export function showAppUpdateAvailableToast(version: string): Id {
  const toast = getToast();
  const toastId = appUpdateToastIdForVersion(version);

  if (toast.isActive?.(toastId)) {
    return toastId;
  }

  return toast(createElement(AppUpdateAvailableToast, { toastId }), {
    ...getToastDefaultOptions(),
    toastId,
    autoClose: false,
    closeOnClick: false,
    className: "app-update-available-toast-host",
  });
}
