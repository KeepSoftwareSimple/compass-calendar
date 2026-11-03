import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1280, height: 700 },
] as const;

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

async function openCancelDialog(page: import("@playwright/test").Page) {
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
          providers: {
            google: { signIn: true, connect: true },
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
          subscriptionStatus: "active",
          trialEndsAt: null,
          isReadOnly: false,
          cancelAtPeriodEnd: false,
        }),
      );
    }

    if (path.endsWith("/api/billing/subscription")) {
      return route.fulfill(
        jsonResponse({
          subscriptionStatus: "active",
          currentPeriodEnd: "2026-04-01T00:00:00.000Z",
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
          price: { amount: 1200, currency: "usd", interval: "month" },
          paymentMethod: {
            brand: "visa",
            last4: "4242",
            expMonth: 12,
            expYear: 2099,
          },
          invoices: [],
        }),
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

  await page.goto("/week", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { level: 1 }).getByRole("button"),
  ).toBeVisible({ timeout: 15000 });

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

  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+Comma");

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible();
  await settings.getByRole("button", { name: "Billing" }).click();
  await settings.getByRole("button", { name: "Cancel subscription" }).click();

  return page.getByRole("dialog", { name: "Cancel your plan?" });
}

for (const viewport of VIEWPORTS) {
  test(`cancel reason dialog fits ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const dialog = await openCancelDialog(page);

    await expect(
      dialog.getByRole("heading", { name: "Cancel your plan?" }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Why are you canceling? (optional)"),
    ).toBeVisible();
    for (const label of [
      "Too expensive",
      "Missing a feature",
      "Switched to another tool",
      "Not using it enough",
      "Technical problems",
      "Other",
    ]) {
      await expect(
        dialog.getByRole("radio", { name: label, exact: true }),
      ).toBeVisible();
    }

    const cancel = dialog.getByRole("button", { name: "Cancel subscription" });
    const keep = dialog.getByRole("button", { name: "Keep plan" });
    await expect(cancel).toBeVisible();
    await expect(keep).toBeVisible();
    await expect(cancel.getByText("Enter", { exact: true })).toBeVisible();
    await expect(cancel).toBeInViewport();
    await expect(keep).toBeInViewport();
    await expect(
      dialog.getByRole("radio", { name: "Other", exact: true }),
    ).toBeInViewport();
  });
}

test("capture full cancel reason dialog artifact", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const dialog = await openCancelDialog(page);
  await expect(
    dialog.getByRole("button", { name: "Cancel subscription" }),
  ).toBeInViewport();
  await dialog.screenshot({
    path: "/opt/cursor/artifacts/cancel-reason-dialog-e2e-full.png",
  });
});
