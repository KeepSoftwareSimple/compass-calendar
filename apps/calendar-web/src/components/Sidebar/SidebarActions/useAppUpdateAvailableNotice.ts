import { useEffect, useRef } from "react";
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
  const lastNotifiedVersionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isUpdateAvailable || !availableVersion) return;
    if (lastNotifiedVersionRef.current === availableVersion) return;
    if (isAppUpdateNoticeHandled(availableVersion)) return;

    lastNotifiedVersionRef.current = availableVersion;
    markAppUpdateNoticeHandled(availableVersion);
    showAppUpdateAvailableToast(availableVersion);
  }, [availableVersion, isUpdateAvailable]);
}
