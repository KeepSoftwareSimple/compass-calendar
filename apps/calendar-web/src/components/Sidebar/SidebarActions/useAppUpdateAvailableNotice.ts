import { useEffect } from "react";
import { appUpdateNoticeActions } from "@web/components/BottomNoticeStack/app-update-notice.store";
import {
  isAppUpdateNoticeHandled,
  markAppUpdateNoticeHandled,
} from "@web/components/Sidebar/SidebarActions/app-update-notice.storage";

/**
 * Queues a one-time bottom-left update notice when `/version.json` reports a
 * newer app build.
 */
export function useAppUpdateAvailableNotice(
  isUpdateAvailable: boolean,
  availableVersion: string | null,
): void {
  useEffect(() => {
    if (!isUpdateAvailable || !availableVersion) return;
    if (isAppUpdateNoticeHandled(availableVersion)) return;

    markAppUpdateNoticeHandled(availableVersion);
    appUpdateNoticeActions.setPendingVersion(availableVersion);
  }, [availableVersion, isUpdateAvailable]);
}
