import {
  getNotificationPort,
  registerNotificationPort,
  resetNotificationPort,
} from "@web/notifications/notification.port";
import { afterEach, describe, expect, it } from "bun:test";

describe("getNotificationPort", () => {
  afterEach(() => {
    delete window.compassDesktop;
    resetNotificationPort();
  });

  it("uses the desktop port when the bridge exposes native notifications", () => {
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      openExternal: () => {},
      setAgenda: () => {},
      restartToUpdate: () => {},
      requestNotificationPermission: async () => "granted",
      showNotification: () => {},
      onDeepLink: () => {},
      onUpdateReady: () => {},
    };
    resetNotificationPort();
    expect(getNotificationPort().isSupported()).toBe(true);
  });

  it("falls back to the browser port without native notification methods", () => {
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      openExternal: () => {},
      setAgenda: () => {},
      restartToUpdate: () => {},
      onDeepLink: () => {},
      onUpdateReady: () => {},
    } as unknown as typeof window.compassDesktop;
    resetNotificationPort();
    expect(getNotificationPort().isSupported()).toBe(false);
  });

  it("honors registerNotificationPort overrides", () => {
    registerNotificationPort({
      isSupported: () => true,
      getPermission: () => "granted",
      requestPermission: async () => "granted",
      show: () => true,
      observePermission: () => () => {},
    });
    expect(getNotificationPort().isSupported()).toBe(true);
  });
});
