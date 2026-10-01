import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import "@web/desktop/compass-desktop.global";
import {
  getNotificationPort,
  registerNotificationPort,
  resetNotificationPort,
} from "@web/notifications/notification.port";

describe("getNotificationPort", () => {
  beforeEach(() => {
    resetNotificationPort();
    delete window.compassDesktop;
  });

  afterEach(() => {
    resetNotificationPort();
    delete window.compassDesktop;
  });

  it("uses the browser port outside the macOS shell", () => {
    const port = getNotificationPort();
    expect(port.isSupported()).toBe(typeof Notification !== "undefined");
  });

  it("uses the desktop port when the bridge is injected", async () => {
    const showNotification = mock(() => {});
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      notificationPermission: "granted",
      openExternal: () => {},
      setAgenda: () => {},
      restartToUpdate: () => {},
      showNotification,
      onDeepLink: () => {},
      onUpdateReady: () => {},
    } as NonNullable<Window["compassDesktop"]>;

    getNotificationPort();
    await import("@web/notifications/notification.desktop.port");
    const port = getNotificationPort();
    expect(port.isSupported()).toBe(true);
    expect(
      port.show("Team sync", {
        body: "Starts at 9:00 AM",
        tag: "evt-1|2026-10-01T14:00:00.000Z",
      }),
    ).toBe(true);
    expect(showNotification).toHaveBeenCalledWith({
      title: "Team sync",
      body: "Starts at 9:00 AM",
      tag: "evt-1|2026-10-01T14:00:00.000Z",
      eventId: "evt-1",
    });
  });

  it("honors registerNotificationPort overrides", () => {
    const custom = {
      isSupported: () => true,
      getPermission: () => "granted" as const,
      requestPermission: async () => "granted" as const,
      show: () => true,
      observePermission: () => () => {},
    };
    registerNotificationPort(custom);
    expect(getNotificationPort()).toBe(custom);
  });
});
