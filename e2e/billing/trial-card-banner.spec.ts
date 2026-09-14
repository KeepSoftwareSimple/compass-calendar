import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1600, height: 900 } });

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const trialEndsAt = new Date(
  Date.now() + 2 * 24 * 60 * 60 * 1000,
).toISOString();

test("shows the trial card banner and opens Checkout while writable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
    localStorage.setItem(
      "compass.auth",
      JSON.stringify({
        hasAuthenticated: true,
        lastKnownEmail: "host@example.com",
      }),
    );
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/api/config")) {
      return route.fulfill(
        jsonResponse({
          version: E2E_APP_CONFIG_VERSION,
          google: { isConfigured: true },
          billing: {
            isConfigured: true,
            enforcement: true,
            trialLengthDays: 7,
            publishableKey: "pk_test_e2e",
          },
        }),
      );
    }

    if (path.endsWith("/api/billing/status")) {
      return route.fulfill(
        jsonResponse({
          subscriptionStatus: "trialing",
          trialEndsAt,
          isReadOnly: false,
          needsPaymentMethod: true,
        }),
      );
    }

    if (path.endsWith("/api/billing/checkout/session")) {
      return route.fulfill(
        jsonResponse({ clientSecret: "cs_test_e2e_trial_banner" }),
      );
    }

    if (path.endsWith("/api/calendars")) {
      return route.fulfill(jsonResponse({ calendars: [] }));
    }

    if (path.endsWith("/api/event") && route.request().method() === "GET") {
      return route.fulfill(jsonResponse({ events: [] }));
    }

    if (path.endsWith("/api/user/metadata")) {
      return route.fulfill(
        jsonResponse({
          google: { connectionState: "NOT_CONNECTED", connections: [] },
        }),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      (
        window as Window & {
          __COMPASS_E2E_HOOKS__?: { setAuthenticated: (v: boolean) => void };
        }
      ).__COMPASS_E2E_HOOKS__ !== undefined,
  );
  await page.evaluate(() => {
    (
      window as Window & {
        __COMPASS_E2E_HOOKS__?: { setAuthenticated: (v: boolean) => void };
      }
    ).__COMPASS_E2E_HOOKS__?.setAuthenticated(true);
  });

  const banner = page.getByRole("status").filter({
    hasText: "Your trial ends in 2 days. Add a card to keep creating events.",
  });
  await expect(banner).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("dialog", { name: "Subscribe to keep using Compass" }),
  ).toHaveCount(0);

  await banner.getByRole("button", { name: "Add a card" }).click();
  await expect(page.getByRole("dialog", { name: "Checkout" })).toBeVisible();
});
