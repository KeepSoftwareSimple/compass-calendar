import {
  openDesktopBillingReturn,
  relayDesktopBillingReturn,
} from "@web/billing/desktop-billing-return";
import { afterEach, describe, expect, it, mock } from "bun:test";

describe("desktop billing return relay", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("builds the compass deep link with outcome and session_id preserved", () => {
    expect(relayDesktopBillingReturn("success", "cs_test_123")).toBe(
      "compass://billing/checkout?outcome=success&session_id=cs_test_123",
    );
    expect(relayDesktopBillingReturn("cancel", "cs_test_456")).toBe(
      "compass://billing/checkout?outcome=cancel&session_id=cs_test_456",
    );
  });

  it("assigns location to the compass billing deep link", () => {
    const mockAssign = mock((_url: string) => {});
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { assign: mockAssign } },
    });

    openDesktopBillingReturn(
      "compass://billing/checkout?outcome=success&session_id=cs_test_123",
    );

    expect(mockAssign).toHaveBeenCalledWith(
      "compass://billing/checkout?outcome=success&session_id=cs_test_123",
    );
  });
});
