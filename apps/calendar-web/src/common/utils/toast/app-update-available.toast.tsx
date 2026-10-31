import { type Id } from "react-toastify";
import { appUpdateNoticeActions } from "@web/components/BottomNoticeStack/app-update-notice.store";

export const APP_UPDATE_TOAST_MESSAGE =
  "Compass just got better. Refresh to update.";

export const APP_UPDATE_RELOAD_SHORTCUT = ["Mod", "R"] as const;

export const APP_UPDATE_REFRESH_LABEL = "Refresh";

export const appUpdateToastIdForVersion = (version: string): Id =>
  `app-update-${version}`;

/** E2E and legacy callers: queue the bottom-left update notice. */
export function showAppUpdateAvailableToast(version: string): Id {
  appUpdateNoticeActions.setPendingVersion(version);
  return appUpdateToastIdForVersion(version);
}
