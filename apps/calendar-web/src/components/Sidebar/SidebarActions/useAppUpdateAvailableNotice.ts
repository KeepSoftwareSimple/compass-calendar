import { useEffect } from "react";
import { showAppUpdateAvailableToast } from "@web/common/utils/toast/app-update-available.toast";
import {
  isAppUpdateNoticeHandled,
  markAppUpdateNoticeHandled,
} from "@web/components/Sidebar/SidebarActions/app-update-notice.storage";

/**
 * Surfaces a one-time toast when `/version.json` reports a newer app build.
 */
export function useAppUpdateAvailableNotice(
  isUpdateAvailable: boolean,
  availableVersion: string | null,
): void {
  useEffect(() => {
    if (!isUpdateAvailable || !availableVersion) return;
    if (isAppUpdateNoticeHandled(availableVersion)) return;

    markAppUpdateNoticeHandled(availableVersion);
    showAppUpdateAvailableToast(availableVersion);
  }, [availableVersion, isUpdateAvailable]);
}
