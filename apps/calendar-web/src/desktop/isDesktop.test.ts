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
      onDeepLink: (_handler) => {},
      onUpdateReady: () => {},
      onResume: () => () => {},
      getLaunchAtLogin: async () => false,
      setLaunchAtLogin: async () => false,
      setAppearance: () => {},
    };
    expect(isDesktop()).toBe(true);
  });
});
