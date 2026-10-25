import { expect, test } from "@playwright/test";
import {
  dispatchDocumentKey,
  getViewSwitcherButton,
} from "../utils/event-test-utils";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1280, height: 800 } });

// Shared dev server state is easier to reason about when these scenarios run
// in file order on one worker (CI already uses one worker globally).
test.describe.configure({ mode: "serial" });

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

const awaitingCheckoutRoutes = async (
  page: import("@playwright/test").Page,
  options: {
    blockEventPost?: boolean;
    onEventPost?: () => void;
  } = {},
) => {
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
          price: { amount: 1200, currency: "usd", interval: "month" },
          paymentMethod: null,
          invoices: [],
        }),
      );
    }

    if (path.endsWith("/api/billing/checkout/session")) {
      return route.fulfill(
        jsonResponse({ clientSecret: "cs_test_e2e_explore_trial" }),
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
      options.onEventPost?.();
      if (options.blockEventPost) {
        return route.fulfill({
          status: 402,
          contentType: "application/json",
          body: JSON.stringify({ code: "BILLING_REQUIRED" }),
        });
      }
    }

    if (path.endsWith("/api/user/metadata")) {
      return route.fulfill(jsonResponse({ connections: [] }));
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.route("https://js.stripe.com/**", (route) => route.abort());
  await page.route("https://*.stripe.com/**", (route) => route.abort());
};

const signInAwaitingCheckout = async (
  page: import("@playwright/test").Page,
) => {
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
};

test("explore banner dismiss hides until the next session", async ({
  page,
}) => {
  await awaitingCheckoutRoutes(page);
  await signInAwaitingCheckout(page);

  const bannerText = "Start your 7-day free trial to plan your week.";
  await expect(page.getByText(bannerText)).toBeVisible({ timeout: 15000 });
  await page.screenshot({
    path: test.info().outputPath("before-explore-calendar-banner.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText(bannerText)).toHaveCount(0);

  await page.screenshot({
    path: test.info().outputPath("after-explore-banner-dismissed.png"),
    fullPage: true,
  });

  await page.evaluate(() => {
    sessionStorage.removeItem(
      "compass.billing.awaiting-checkout-banner-dismissed-session",
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
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

  await expect(page.getByText(bannerText)).toBeVisible({ timeout: 15000 });
});

test("opening settings does not open the trial step", async ({ page }) => {
  await awaitingCheckoutRoutes(page);
  await signInAwaitingCheckout(page);

  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});

test("event create opens the draft without the trial step", async ({
  page,
}) => {
  await awaitingCheckoutRoutes(page);
  await signInAwaitingCheckout(page);

  await expect(
    page.getByText("Start your 7-day free trial to plan your week."),
  ).toBeVisible({ timeout: 15000 });
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
  await dispatchDocumentKey(page, "c");
  const titleInput = page.getByRole("form").getByPlaceholder("Title");
  await expect(titleInput).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toHaveCount(0);
  expect(page.url()).not.toContain("auth=trial");

  await page.screenshot({
    path: test.info().outputPath("explore-draft-open-before-save.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(titleInput).toHaveCount(0);
});

test("save opens the trial step and closing keeps the draft without a ghost event", async ({
  page,
}) => {
  await awaitingCheckoutRoutes(page);
  const calendarsLoaded = page.waitForResponse(
    (response) => response.url().includes("/api/calendars") && response.ok(),
  );
  await signInAwaitingCheckout(page);

  await expect(
    page.getByText("Start your 7-day free trial to plan your week."),
  ).toBeVisible({ timeout: 15000 });
  await calendarsLoaded;
  await dispatchDocumentKey(page, "c");
  const draftTitle = "Explore gate on save";
  const titleInput = page.getByRole("form").getByPlaceholder("Title");
  await expect(titleInput).toBeVisible({ timeout: 15000 });
  await titleInput.fill(draftTitle);
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

  const saveButton = page.getByRole("form").getByRole("button", {
    name: "Save",
  });
  await saveButton.evaluate((el) => {
    (el as HTMLElement).click();
  });

  const trialDialog = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await expect(trialDialog).toBeVisible({ timeout: 15000 });
  expect(page.url()).toContain("auth=trial");
  await trialDialog.screenshot({
    path: test.info().outputPath("explore-trial-step-on-save.png"),
  });

  await page.keyboard.press("Escape");
  await expect(trialDialog).toHaveCount(0);
  await expect(titleInput).toHaveValue(draftTitle);
  expect(page.url()).not.toContain("auth=trial");

  await page.reload({ waitUntil: "domcontentloaded" });
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
  expect(page.url()).not.toContain("auth=trial");
  await expect(
    page.locator("#timedEvents").getByRole("button", { name: draftTitle }),
  ).toHaveCount(0);
});

test("switching views does not open the trial step", async ({ page }) => {
  await awaitingCheckoutRoutes(page);
  await signInAwaitingCheckout(page);

  await getViewSwitcherButton(page).waitFor({ state: "visible" });
  await page.locator("#mainGrid").focus();
  await page.keyboard.press("d");
  await page.waitForURL((url) => url.pathname.startsWith("/day"), {
    timeout: 10000,
  });

  await expect(
    page.getByRole("dialog", { name: "Start your 7-day free trial" }),
  ).toHaveCount(0);
  expect(page.url()).not.toContain("auth=trial");
});
