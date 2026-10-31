import { type FC, useCallback } from "react";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import {
  APP_UPDATE_REFRESH_LABEL,
  APP_UPDATE_RELOAD_SHORTCUT,
  APP_UPDATE_TOAST_MESSAGE,
} from "@web/common/utils/toast/app-update-available.toast";
import {
  appUpdateNoticeActions,
  useAppUpdateNoticeStore,
} from "@web/components/BottomNoticeStack/app-update-notice.store";
import { BottomNotice } from "@web/components/BottomNoticeStack/BottomNotice";
import { BOTTOM_NOTICE_QUEUE_ID } from "@web/components/BottomNoticeStack/bottom-notice.constants";
import { useBottomNoticeQueue } from "@web/components/BottomNoticeStack/useBottomNoticeQueue";
import { useReloadAppShortcut } from "@web/components/Sidebar/SidebarActions/useReloadAppShortcut";

export const AppUpdateAvailableNotice: FC = () => {
  const pendingVersion = useAppUpdateNoticeStore((s) => s.pendingVersion);
  const eligible = pendingVersion !== null;
  const visible = useBottomNoticeQueue(
    BOTTOM_NOTICE_QUEUE_ID.appUpdate,
    eligible,
  );

  useReloadAppShortcut(visible);

  const dismiss = useCallback(() => {
    appUpdateNoticeActions.dismissForSession();
  }, []);

  const refresh = useCallback(() => {
    reloadLocation();
  }, []);

  if (!visible) return null;

  return (
    <BottomNotice
      ariaLabel="App update available"
      data-app-update-notice=""
      dismissAriaLabel="Dismiss update notice"
      message={APP_UPDATE_TOAST_MESSAGE}
      onDismiss={dismiss}
      onPrimary={refresh}
      primaryLabel={APP_UPDATE_REFRESH_LABEL}
      primaryShortcutKeys={[...APP_UPDATE_RELOAD_SHORTCUT]}
    />
  );
};
