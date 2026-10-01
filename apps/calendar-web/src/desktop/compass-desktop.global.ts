import {
  type DesktopAgenda,
  type DesktopBridgePlatform,
} from "@core/types/desktop-bridge.contracts";

export type CompassDesktopDeepLinkHandler = (url: string) => void;
export type CompassDesktopUpdateReadyHandler = (version: string) => void;
/** Every `on*` registration hands back the matching unsubscribe. */
export type CompassDesktopUnsubscribe = () => void;

export type CompassDesktopNotificationPayload = {
  title: string;
  body?: string;
  tag?: string;
  eventId: string;
};

/**
 * Shape of `window.compassDesktop` as injected by `BridgeScript.swift`. The
 * notification members are optional because an older installed shell can host
 * a newer web build; callers guard on them rather than on the bridge version.
 */
export type CompassDesktopBridge = {
  version: string;
  platform: DesktopBridgePlatform;
  openExternal: (url: string) => void;
  setAgenda: (items: DesktopAgenda) => void;
  restartToUpdate: () => void;
  dispatchShortcut?: (name: string) => boolean;
  onDeepLink: (
    handler: CompassDesktopDeepLinkHandler,
  ) => CompassDesktopUnsubscribe;
  onUpdateReady: (
    handler: CompassDesktopUpdateReadyHandler,
  ) => CompassDesktopUnsubscribe;
  notificationPermission?: NotificationPermission;
  showNotification?: (payload: CompassDesktopNotificationPayload) => void;
  requestNotificationPermission?: () => Promise<NotificationPermission>;
  getNotificationPermission?: () => Promise<NotificationPermission>;
  onNotificationPermissionChange?: (
    handler: () => void,
  ) => CompassDesktopUnsubscribe;
  /** Global quick-add hotkey string (macOS shell). */
  getQuickAddHotkey?: () => string;
  setQuickAddHotkey?: (shortcut: string) => void;
  dismissQuickAddPanel?: () => void;
};

declare global {
  interface Window {
    compassDesktop?: CompassDesktopBridge;
  }
}
