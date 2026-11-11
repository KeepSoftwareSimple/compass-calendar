import { POSTHOG_IS_SYNTHETIC_PROPERTY } from "@core/analytics/synthetic-account.util";
import {
  filterPosthogAudience,
  POSTHOG_INTERNAL_OR_TEST_USER_PROPERTY,
  posthogInternalOrTestUserRegistration,
} from "@web/auth/posthog/posthog-audience-filter.util";
import { describe, expect, it } from "bun:test";

describe("filterPosthogAudience", () => {
  it("drops events from bot user agents", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (compatible; YandexBot/3.0)",
    });
    try {
      expect(
        filterPosthogAudience({
          event: "welcome_modal_shown",
          properties: {},
        } as never),
      ).toBeNull();
    } finally {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: original,
      });
    }
  });

  it("keeps headless events that carry the synthetic journey tag", () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    });
    try {
      expect(
        filterPosthogAudience({
          event: "checkout_opened",
          properties: { [POSTHOG_IS_SYNTHETIC_PROPERTY]: true },
        } as never),
      ).not.toBeNull();
      expect(
        filterPosthogAudience({
          event: "checkout_opened",
          properties: { [POSTHOG_IS_SYNTHETIC_PROPERTY]: "true" },
        } as never),
      ).toBeNull();
      expect(
        filterPosthogAudience({
          event: "checkout_opened",
          properties: {},
        } as never),
      ).toBeNull();
    } finally {
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value: original,
      });
    }
  });

  it("passes events from normal browsers through", () => {
    expect(
      filterPosthogAudience({
        event: "welcome_modal_shown",
        properties: {},
      } as never),
    ).not.toBeNull();
  });
});

describe("posthogInternalOrTestUserRegistration", () => {
  it("uses the PostHog internal-or-test person property name", () => {
    expect(posthogInternalOrTestUserRegistration()).toEqual({
      [POSTHOG_INTERNAL_OR_TEST_USER_PROPERTY]: true,
    });
  });
});
