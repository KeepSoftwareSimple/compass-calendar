import {
  type DesktopAgenda,
  type DesktopBridgePlatform,
} from "@core/types/desktop-bridge.contracts";

export type CompassDesktopDeepLinkHandler = (url: string) => void;
export type CompassDesktopUpdateReadyHandler = (version: string) => void;

export type CompassDesktopBridge = {
  version: string;
  platform: DesktopBridgePlatform;
  openExternal: (url: string) => void;
  setAgenda: (items: DesktopAgenda) => void;
  restartToUpdate: () => void;
  onDeepLink: (handler: CompassDesktopDeepLinkHandler) => void;
  onUpdateReady: (handler: CompassDesktopUpdateReadyHandler) => void;
};

declare global {
  interface Window {
    compassDesktop?: CompassDesktopBridge;
  }
}
