import { type z } from "zod/v4";
import {
  type DesktopAgenda,
  type DesktopBridgePlatform,
  type DesktopBridgeThemeSchema,
} from "@core/types/desktop-bridge.contracts";

export type CompassDesktopDeepLinkHandler = (url: string) => void;
export type CompassDesktopUpdateReadyHandler = (version: string) => void;
export type CompassDesktopResumeHandler = () => void;
export type DesktopBridgeTheme = z.infer<typeof DesktopBridgeThemeSchema>;

export type CompassDesktopBridge = {
  version: string;
  platform: DesktopBridgePlatform;
  openExternal: (url: string) => void;
  setAgenda: (items: DesktopAgenda) => void;
  restartToUpdate: () => void;
  onDeepLink: (handler: CompassDesktopDeepLinkHandler) => void;
  onUpdateReady: (handler: CompassDesktopUpdateReadyHandler) => void;
  onResume: (handler: CompassDesktopResumeHandler) => () => void;
  getLaunchAtLogin: () => Promise<boolean>;
  setLaunchAtLogin: (enabled: boolean) => Promise<boolean>;
  setAppearance: (theme: DesktopBridgeTheme) => void;
};

declare global {
  interface Window {
    compassDesktop?: CompassDesktopBridge;
  }
}
