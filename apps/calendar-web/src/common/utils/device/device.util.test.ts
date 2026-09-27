import { isMobileOS } from "@web/common/utils/device/device.util";
import { afterEach, describe, expect, it } from "bun:test";

const UA = {
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
} as const;

const originalUserAgent = navigator.userAgent;

const setUserAgent = (value: string) => {
  Object.defineProperty(window.navigator, "userAgent", {
    value,
    configurable: true,
    writable: true,
  });
};

const setUserAgentData = (value: { mobile: boolean } | undefined) => {
  Object.defineProperty(window.navigator, "userAgentData", {
    value,
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  setUserAgent(originalUserAgent);
  setUserAgentData(undefined);
});

describe("isMobileOS", () => {
  it("prefers userAgentData.mobile when available", () => {
    setUserAgent(UA.mac);
    setUserAgentData({ mobile: true });
    expect(isMobileOS()).toBe(true);

    setUserAgentData({ mobile: false });
    expect(isMobileOS()).toBe(false);
  });

  it("detects Android and iPhone user agents", () => {
    setUserAgent(UA.android);
    expect(isMobileOS()).toBe(true);

    setUserAgent(UA.iphone);
    expect(isMobileOS()).toBe(true);
  });

  it("treats desktop and iPad user agents as not mobile", () => {
    setUserAgent(UA.mac);
    expect(isMobileOS()).toBe(false);

    // iPads get the responsive layout, not the gate
    setUserAgent(UA.ipad);
    expect(isMobileOS()).toBe(false);
  });
});
