import {
  getNotificationPort,
  registerNotificationPort,
  resetNotificationPort,
} from "@web/notifications/notification.port";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("getNotificationPort", () => {
  beforeEach(() => {
    resetNotificationPort();
  });

  afterEach(() => {
    resetNotificationPort();
  });

  it("uses the browser port", () => {
    const port = getNotificationPort();
    expect(port.isSupported()).toBe(typeof Notification !== "undefined");
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
