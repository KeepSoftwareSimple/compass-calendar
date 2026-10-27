import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1280, height: 800 } });

const TRIAL_ASK_CHARGE_LINE = /No charge until .+\. Cancel anytime\./;
const SETTINGS_BILLING_PRICE_LINE = "$7.99/mo after 7 days. Cancel anytime.";

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const billingRoutes = async (page: import("@playwright/test").Page) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

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
          price: null,
          paymentMethod: null,
          invoices: [],
        }),
      );
    }

    if (path.endsWith("/api/billing/checkout/session")) {
      return route.fulfill(
        jsonResponse({ clientSecret: "cs_test_e2e_artifacts" }),
      );
    }

    if (path.endsWith("/api/calendars")) {
      return route.fulfill(jsonResponse({ calendars: [] }));
    }

    if (path.endsWith("/api/event") && route.request().method() === "GET") {
      return route.fulfill(jsonResponse({ events: [] }));
    }

    if (path.endsWith("/api/user/metadata")) {
      return route.fulfill(jsonResponse({ connections: [] }));
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.route("https://js.stripe.com/**", (route) => route.abort());
  await page.route("https://*.stripe.com/**", (route) => route.abort());
};

test("capture trial flow screenshots", async ({ page }) => {
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
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await billingRoutes(page);

  await page.goto("/day?auth=trial", { waitUntil: "domcontentloaded" });
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

  const signupDialog = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await expect(signupDialog).toBeVisible({ timeout: 15000 });
  await expect(signupDialog.getByText(TRIAL_ASK_CHARGE_LINE)).toBeVisible();
  await signupDialog.screenshot({
    path: test.info().outputPath("trial-step-ask.png"),
  });

  await signupDialog.getByRole("button", { name: "Start free trial" }).click();
  await expect(
    signupDialog.getByRole("button", { name: "Back" }),
  ).toBeVisible();
  await signupDialog.screenshot({
    path: test.info().outputPath("trial-step-stripe.png"),
  });

  await signupDialog.getByRole("button", { name: "Back" }).click();
  await expect(
    signupDialog.getByRole("button", { name: "Start free trial" }),
  ).toBeVisible();
  await signupDialog.screenshot({
    path: test.info().outputPath("trial-step-back-to-ask.png"),
  });

  await signupDialog.getByRole("button", { name: "Back" }).click();
  await expect(signupDialog).toHaveCount(0);

  await page.goto("/day?settings=billing", { waitUntil: "domcontentloaded" });
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

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible({ timeout: 15000 });
  await expect(
    settingsDialog.getByRole("button", { name: "Start free trial" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(settingsDialog.getByText("Trial not started")).toBeVisible();
  await expect(
    settingsDialog.getByText(SETTINGS_BILLING_PRICE_LINE),
  ).toBeVisible();
  await expect(
    settingsDialog.getByRole("button", { name: "Start free trial" }),
  ).toContainText("S");
  await settingsDialog.screenshot({
    path: test.info().outputPath("billing-settings-trial-not-started.png"),
  });

  await settingsDialog
    .getByRole("button", { name: "Start free trial" })
    .click();
  const settingsTrialAsk = page.getByRole("dialog", {
    name: "Start your free trial",
  });
  await expect(
    settingsTrialAsk.getByText(SETTINGS_BILLING_PRICE_LINE),
  ).toBeVisible();
  await settingsTrialAsk.screenshot({
    path: test.info().outputPath("trial-follow-up-settings-ask.png"),
  });
});
