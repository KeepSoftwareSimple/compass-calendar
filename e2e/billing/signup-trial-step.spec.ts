import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1280, height: 800 } });

const TRIAL_PRICE_LINE = "$7.99/mo after 7 days. Cancel anytime in Settings.";

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test("awaiting checkout can explore the calendar and opt into the trial step", async ({
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
        lastKnownEmail: "new@example.com",
      }),
    );
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
    sessionStorage.removeItem(
      "compass.billing.awaiting-checkout-banner-dismissed-session",
    );
  });

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
          price: { amount: 799, currency: "usd", interval: "month" },
          paymentMethod: null,
          invoices: [],
        }),
      );
    }

    if (path.endsWith("/api/billing/checkout/session")) {
      return route.fulfill(
        jsonResponse({ clientSecret: "cs_test_e2e_signup_trial_step" }),
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
          connections: [],
        }),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.route("https://js.stripe.com/**", (route) => route.abort());
  await page.route("https://*.stripe.com/**", (route) => route.abort());

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
    page.getByText("Start your 7-day free trial to plan your week."),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Finish starting your trial" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Start free trial" }).click();

  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toBeVisible({ timeout: 15000 });

  await expect(page.getByText(TRIAL_PRICE_LINE)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start free trial" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Start free trial" }).click();

  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start free trial" }),
  ).toHaveCount(0);

  if (process.env.CAPTURE_SIGNUP_TRIAL_SCREENSHOT === "1") {
    const dialog = page.getByRole("dialog", {
      name: "Start your 7-day free trial",
    });
    await dialog.screenshot({
      path: test.info().outputPath("signup-trial-step-layout-1280.png"),
    });
  }

  await expect(page.getByRole("button", { name: "Back" })).toBeFocused();
  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toBeVisible();
  await expect(page.getByText(TRIAL_PRICE_LINE)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start free trial" }),
  ).toBeVisible();

  const trialDialogAfterBack = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await trialDialogAfterBack.getByRole("button", { name: "Back" }).click();

  await expect(
    page.getByRole("dialog", { name: "Finish starting your trial" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Start your 7-day free trial to plan your week."),
  ).toBeVisible();
});
