import {
  type DesktopAgenda,
  type DesktopBridgePlatform,
} from "@core/types/desktop-bridge.contracts";

export type CompassDesktopDeepLinkHandler = (url: string) => void;
export type CompassDesktopUpdateReadyHandler = (version: string) => void;
export type CompassDesktopNotificationPermissionHandler = () => void;

export type CompassDesktopShowNotificationPayload = {
  title: string;
  body?: string;
  tag?: string;
  eventId: string;
};

export type CompassDesktopBridge = {
  version: string;
  platform: DesktopBridgePlatform;
  notificationPermission?: NotificationPermission;
  openExternal: (url: string) => void;
  setAgenda: (items: DesktopAgenda) => void;
  restartToUpdate: () => void;
  requestNotificationPermission?: () => Promise<NotificationPermission>;
  getNotificationPermission?: () => Promise<NotificationPermission>;
  showNotification?: (payload: CompassDesktopShowNotificationPayload) => void;
  onNotificationPermissionChange?: (
    handler: CompassDesktopNotificationPermissionHandler,
  ) => () => void;
  onDeepLink: (handler: CompassDesktopDeepLinkHandler) => void;
  onUpdateReady: (handler: CompassDesktopUpdateReadyHandler) => void;
};

declare global {
  interface Window {
    compassDesktop?: CompassDesktopBridge;
  }
}
