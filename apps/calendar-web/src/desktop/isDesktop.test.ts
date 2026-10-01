import { isDesktop } from "@web/desktop/isDesktop";
import { afterEach, describe, expect, it } from "bun:test";

describe("isDesktop", () => {
  afterEach(() => {
    delete window.compassDesktop;
  });

  it("is false without the bridge", () => {
    expect(isDesktop()).toBe(false);
  });

  it("is true when the bridge exposes a version", () => {
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
    expect(isDesktop()).toBe(true);
  });
});
