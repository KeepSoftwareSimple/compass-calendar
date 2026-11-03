import { expect, test } from "@playwright/test";
import {
  dismissExploreTrialBannerIfOpen,
  waitForWritableCalendarsReady,
} from "../utils/event-test-utils";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1280, height: 800 } });

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test("first event save after hosted signup opens the trial step", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();

    if (path.endsWith("/api/config")) {
      return route.fulfill(
        jsonResponse({
          version: E2E_APP_CONFIG_VERSION,
          providers: {
            google: { signIn: false, connect: false },
            microsoft: { signIn: false, connect: false },
            apple: { signIn: false, connect: false },
          },
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
          subscriptionStatus: "awaiting_checkout",
          trialEndsAt: null,
          isReadOnly: true,
        }),
      );
    }

    if (path.endsWith("/api/billing/subscription")) {
      return route.fulfill(
        jsonResponse({
          subscriptionStatus: "awaiting_checkout",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
          price: { amount: 799, currency: "usd", interval: "month" },
          paymentMethod: null,
          invoices: [],
        }),
      );
    }

    if (path.endsWith("/api/billing/checkout/session")) {
      return route.fulfill(
        jsonResponse({ clientSecret: "cs_test_e2e_first_event_trial" }),
      );
    }

    if (path.endsWith("/api/calendars")) {
      return route.fulfill(
        jsonResponse({
          calendars: [
            {
              id: "cccccccccccccccccccccccc",
              name: "Personal",
              description: "",
              timeZone: null,
              foregroundColor: "#ffffff",
              backgroundColor: "#5484ed",
              provider: "local",
              access: "owner",
              isPrimary: true,
              isVisible: true,
              isActive: true,
              capabilities: {
                canReadAvailability: true,
                canReadDetails: true,
                canWrite: true,
                canManage: true,
                canWatchEvents: true,
                canInviteAttendees: false,
                conferenceKinds: [],
              },
            },
          ],
        }),
      );
    }

    if (path.endsWith("/api/event") && method === "GET") {
      return route.fulfill(jsonResponse({ events: [] }));
    }

    if (path.endsWith("/api/event") && method === "POST") {
      return route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "BILLING_REQUIRED",
          message: "A paid subscription is required to make changes",
          retryable: false,
        }),
      });
    }

    if (path.endsWith("/api/user/metadata")) {
      return route.fulfill(jsonResponse({ connections: [] }));
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.addInitScript(() => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
    localStorage.setItem(
      "compass.auth",
      JSON.stringify({
        hasAuthenticated: true,
        lastKnownEmail: "new@example.com",
      }),
    );
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.removeItem("compass.onboarding.first-event-done");
    sessionStorage.removeItem(
      "compass.billing.awaiting-checkout-banner-dismissed-session",
    );
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

  await expect(
    page.getByRole("complementary", { name: "Create your first event" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("dialog", { name: "Bring your events" }),
  ).toHaveCount(0);
  await waitForWritableCalendarsReady(page);
  await dismissExploreTrialBannerIfOpen(page);
  await page.waitForFunction(() => {
    const lock = (
      window as Window & {
        __COMPASS_E2E_BILLING_WRITE_LOCK__?: {
          locked: boolean;
          status: string | null;
        };
      }
    ).__COMPASS_E2E_BILLING_WRITE_LOCK__;
    return lock?.locked === true && lock.status === "awaiting_checkout";
  });

  await page
    .getByRole("complementary", { name: "Create your first event" })
    .getByRole("button", { name: "Add event" })
    .click();

  const trialDialog = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await expect(trialDialog).toBeVisible({ timeout: 15000 });
  expect(page.url()).toContain("auth=trial");
});
