import { expect, test } from "@playwright/test";
import dayjs from "@core/util/date/dayjs";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ viewport: { width: 1600, height: 900 } });

/** Pinned "now" for charge-date copy (`formatTrialChargeDate`, 7-day trial). */
const PINNED_NOW_ISO = "2026-09-29T12:00:00.000Z";
const TRIAL_LENGTH_DAYS = 7;
const EXPECTED_CHARGE_DATE_LABEL = dayjs(PINNED_NOW_ISO)
  .add(TRIAL_LENGTH_DAYS, "day")
  .format("dddd, MMMM D");

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test("signup trial step shows charge-date copy and closing opens the billing gate", async ({
  page,
}) => {
  await page.addInitScript((pinnedIso: string) => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
    const fixedMs = new Date(pinnedIso).getTime();
    const RealDate = globalThis.Date;
    const PinnedDate = class extends RealDate {
      constructor(
        ...args: [] | [number] | [string] | [number, number, number]
      ) {
        if (args.length === 0) {
          super(fixedMs);
        } else {
          super(...(args as ConstructorParameters<typeof RealDate>));
        }
      }
      static now() {
        return fixedMs;
      }
    };
    globalThis.Date = PinnedDate as DateConstructor;

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
  }, PINNED_NOW_ISO);

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
          price: { amount: 1200, currency: "usd", interval: "month" },
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

  await expect(
    page.getByText(
      `Your card will not be charged until ${EXPECTED_CHARGE_DATE_LABEL}. Cancel anytime`,
    ),
  ).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(
    page.getByRole("dialog", { name: "Finish starting your trial" }),
  ).toBeVisible({ timeout: 15000 });
});
