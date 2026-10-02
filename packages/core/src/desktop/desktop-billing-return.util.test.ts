import {
  buildDesktopBillingCheckoutDeepLink,
  buildDesktopBillingReturnUrl,
  STRIPE_CHECKOUT_SESSION_ID_PLACEHOLDER,
} from "@core/desktop/desktop-billing-return.util";
import { describe, expect, it } from "bun:test";

describe("desktop billing return urls", () => {
  it("builds success and cancel return URLs with the Stripe session placeholder", () => {
    expect(
      buildDesktopBillingReturnUrl("http://localhost:9080", "success"),
    ).toBe(
      `http://localhost:9080/billing/desktop-return?outcome=success&session_id=${STRIPE_CHECKOUT_SESSION_ID_PLACEHOLDER}`,
    );
    expect(
      buildDesktopBillingReturnUrl("http://localhost:9080/", "cancel"),
    ).toBe(
      `http://localhost:9080/billing/desktop-return?outcome=cancel&session_id=${STRIPE_CHECKOUT_SESSION_ID_PLACEHOLDER}`,
    );
  });

  it("builds the compass billing checkout deep link", () => {
    expect(buildDesktopBillingCheckoutDeepLink("success", "cs_test_123")).toBe(
      "compass://billing/checkout?outcome=success&session_id=cs_test_123",
    );
  });
});
