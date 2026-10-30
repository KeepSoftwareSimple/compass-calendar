import { createElement } from "react";
import { type Id } from "react-toastify";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { ToastDismissHint } from "@web/common/utils/toast/ToastDismissHint";
import { getToast } from "@web/common/utils/toast/toast.port";
import { useReloadAppShortcut } from "@web/components/Sidebar/SidebarActions/useReloadAppShortcut";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";

export const APP_UPDATE_TOAST_MESSAGE =
  "Compass just got better. Refresh to update.";

const RELOAD_SHORTCUT_PARTS = [
  "Or press ",
  { keys: ["Mod", "R"] as const },
  " to refresh.",
] as const;

export const appUpdateToastIdForVersion = (version: string): Id =>
  `app-update-${version}`;

export function AppUpdateAvailableToast({
  toastId: _toastId,
}: {
  toastId: Id;
}) {
  useReloadAppShortcut(true);

  return (
    <div className="flex w-full flex-col gap-2 text-text" data-notice="">
      <p className="text-sm text-text">{APP_UPDATE_TOAST_MESSAGE}</p>
      <p className="text-text-muted text-xs">
        <ShortcutTipParts parts={RELOAD_SHORTCUT_PARTS} />
      </p>
      <ToastDismissHint />
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
    closeOnClick: true,
    onClick: () => {
      reloadLocation();
    },
  });
}
