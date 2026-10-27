import { expect, type Page, test } from "@playwright/test";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1600, height: 900 } });

const CALLBACK_PATH = "/auth/google/callback";
const INTENT_STORAGE_PREFIX = "compass.googleAuthorizationIntent";
const REQUIRED_SCOPES = [...GOOGLE_SCOPES];
const TRIAL_CHARGE_LINE = /No charge until .+\. Cancel anytime\./;

const getIntentStorageKey = (state: string) =>
  `${INTENT_STORAGE_PREFIX}.${state}`;

const getCallbackUrl = (state: string) =>
  `${CALLBACK_PATH}?state=${encodeURIComponent(
    state,
  )}&code=auth-code&scope=${encodeURIComponent(REQUIRED_SCOPES.join(" "))}`;

const prepareSignupTrialPage = async (page: Page) => {
  const loginOrSignupRequests: unknown[] = [];

  await page.addInitScript(() => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/api/signinup")) {
      loginOrSignupRequests.push(request.postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          createdNewRecipeUser: true,
          user: { emails: ["new@example.com"] },
        }),
      });
    }

    if (url.pathname.endsWith("/api/config")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: E2E_APP_CONFIG_VERSION,
          providers: {
            google: { signIn: true, connect: true },
            microsoft: { signIn: false, connect: false },
            apple: { signIn: false, connect: false },
          },
          billing: {
            isConfigured: true,
            enforcement: true,
            trialLengthDays: 7,
            publishableKey: "pk_test_e2e_trial_back",
          },
        }),
      });
    }

    if (url.pathname.endsWith("/api/billing/status")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          subscriptionStatus: "awaiting_checkout",
          trialEndsAt: null,
          isReadOnly: true,
        }),
      });
    }

    if (url.pathname.endsWith("/api/billing/subscription")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          subscriptionStatus: "awaiting_checkout",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
          price: { amount: 799, currency: "usd", interval: "month" },
          paymentMethod: null,
          invoices: [],
        }),
      });
    }

    if (url.pathname.endsWith("/api/billing/checkout/session")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ clientSecret: "cs_test_e2e_trial_back" }),
      });
    }

    if (url.pathname.endsWith("/api/calendars")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ calendars: [] }),
      });
    }

    if (url.pathname.endsWith("/api/event") && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: [] }),
      });
    }

    if (url.pathname.endsWith("/api/user/metadata")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ connections: [] }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("https://js.stripe.com/**", (route) => route.abort());
  await page.route("https://*.stripe.com/**", (route) => route.abort());

  return { loginOrSignupRequests };
};

test("trial step back avoids oauth replay and duplicate billing_gate_shown", async ({
  page,
}) => {
  const state = "signup-trial-back-state";
  const { loginOrSignupRequests } = await prepareSignupTrialPage(page);

  await page.goto("/week");
  await page.evaluate(
    ({ key, value }) => {
      sessionStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: getIntentStorageKey(state),
      value: {
        intent: "signIn",
        returnPath: "/week?auth=trial",
        createdAt: Date.now(),
      },
    },
  );

  await page.goto(getCallbackUrl(state));
  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(TRIAL_CHARGE_LINE)).toBeVisible();
  expect(loginOrSignupRequests).toHaveLength(1);

  await page.evaluate(() => {
    const trialUrl = window.location.href;
    window.history.pushState(null, "", "/auth/google/callback");
    window.history.pushState(null, "", trialUrl);
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/week/);
  await expect(page).not.toHaveURL(/\/auth\/google\/callback/);
  await expect(
    page.getByRole("dialog", { name: "Finish starting your trial" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Start your 7-day free trial to plan your week."),
  ).toBeVisible({ timeout: 15000 });

  await page.goto("/week?auth=trial", { waitUntil: "domcontentloaded" });
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
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toBeVisible({ timeout: 15000 });

  const trialDialog = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await trialDialog.getByRole("button", { name: "Start free trial" }).click();
  await trialDialog.getByRole("button", { name: /^Back\b/ }).click();
  await expect(page.getByText(TRIAL_CHARGE_LINE)).toBeVisible();
  await expect(
    trialDialog.getByRole("button", { name: "Start free trial" }),
  ).toBeVisible();
  await trialDialog.getByRole("button", { name: "Back" }).click();
  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Start your 7-day free trial to plan your week."),
  ).toBeVisible({ timeout: 15000 });

  await page.goto(CALLBACK_PATH);
  await expect(page).toHaveURL(/\/week/);
  expect(loginOrSignupRequests).toHaveLength(1);
  await expect(
    page.getByText("We couldn't connect your Google account"),
  ).toHaveCount(0);
});
