import { XIcon } from "@phosphor-icons/react/dist/csr/X";
import { createElement } from "react";
import { type Id } from "react-toastify";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { getToast } from "@web/common/utils/toast/toast.port";
import IconButton from "@web/components/IconButton/IconButton";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { useReloadAppShortcut } from "@web/components/Sidebar/SidebarActions/useReloadAppShortcut";

export const APP_UPDATE_TOAST_MESSAGE =
  "Compass just got better. Refresh to update.";

export const APP_UPDATE_RELOAD_SHORTCUT = ["Mod", "R"] as const;

export const appUpdateToastIdForVersion = (version: string): Id =>
  `app-update-${version}`;

export function AppUpdateAvailableToast({ toastId }: { toastId: Id }) {
  useReloadAppShortcut(true);

  const dismiss = () => {
    getToast().dismiss(toastId);
  };

  return (
    <div
      className="app-update-available-toast flex w-full min-w-0 max-w-full items-center gap-2 text-text"
      data-notice=""
    >
      <button
        className="app-update-available-toast-action c-focus-ring min-w-0 flex-1 shrink rounded-default px-1 py-0.5 text-left text-sm transition hover:bg-surface-overlay"
        onClick={() => {
          reloadLocation();
        }}
        type="button"
      >
        <span className="app-update-available-toast-message min-w-0">
          {APP_UPDATE_TOAST_MESSAGE}
        </span>
      </button>
      <ShortcutKeys
        className="app-update-available-toast-keys shrink-0"
        keys={[...APP_UPDATE_RELOAD_SHORTCUT]}
      />
      <IconButton
        aria-label="Dismiss update notice"
        className="app-update-available-toast-dismiss shrink-0 text-text-muted hover:text-text"
        onClick={dismiss}
        size="small"
      >
        <XIcon aria-hidden="true" size={14} />
      </IconButton>
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
