import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1600, height: 900 } });

const jsonResponse = (body: unknown) => ({
  status: 200,
  contentType: "application/json",
  body: JSON.stringify(body),
});

test("keeps billing receipts aligned and plan actions on one row", async ({
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
          subscriptionStatus: "active",
          trialEndsAt: null,
          isReadOnly: false,
        }),
      );
    }

    if (path.endsWith("/api/billing/subscription")) {
      return route.fulfill(
        jsonResponse({
          subscriptionStatus: "active",
          currentPeriodEnd: "2026-10-04T12:00:00.000Z",
          cancelAtPeriodEnd: false,
          trialEndsAt: null,
          price: { amount: 799, currency: "usd", interval: "month" },
          paymentMethod: {
            brand: "mastercard",
            last4: "9200",
            expMonth: 10,
            expYear: 2029,
          },
          invoices: [
            {
              id: "in_paid",
              createdAt: "2026-09-04T12:00:00.000Z",
              amountPaid: 799,
              currency: "usd",
              status: "paid",
              hostedInvoiceUrl: "https://invoice.stripe.com/paid",
            },
            {
              id: "in_trial",
              createdAt: "2026-08-28T12:00:00.000Z",
              amountPaid: 0,
              currency: "usd",
              status: "paid",
              hostedInvoiceUrl: "https://invoice.stripe.com/trial",
            },
          ],
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
      return route.fulfill(
        jsonResponse({
          google: { connectionState: "NOT_CONNECTED", connections: [] },
        }),
      );
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
  await page.keyboard.press("Control+Comma");

  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible({ timeout: 10000 });
  await settings.getByRole("button", { name: "Billing" }).click();

  const updateCard = settings.getByRole("button", { name: "Update card" });
  const cancel = settings.getByRole("button", { name: "Cancel subscription" });
  await expect(updateCard).toBeVisible();
  await expect(cancel).toBeVisible();

  const updateBox = await updateCard.boundingBox();
  const cancelBox = await cancel.boundingBox();
  expect(updateBox).not.toBeNull();
  expect(cancelBox).not.toBeNull();
  expect(Math.abs((updateBox?.y ?? 0) - (cancelBox?.y ?? 0))).toBeLessThan(2);
  expect(cancelBox?.x ?? 0).toBeGreaterThan(updateBox?.x ?? 0);

  const cancelBackground = await cancel.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(cancelBackground).toBe("rgb(173, 101, 83)");

  const receipts = settings.getByRole("table", { name: "Receipts" });
  await expect(receipts).toBeVisible();
  const amounts = receipts.getByRole("cell", { name: /^\$/ });
  await expect(amounts).toHaveCount(2);
  const firstAmount = await amounts.nth(0).boundingBox();
  const secondAmount = await amounts.nth(1).boundingBox();
  expect(firstAmount).not.toBeNull();
  expect(secondAmount).not.toBeNull();
  expect(Math.abs((firstAmount?.x ?? 0) - (secondAmount?.x ?? 0))).toBeLessThan(
    1,
  );

  const statuses = receipts.getByRole("cell", { name: "Paid" });
  const firstStatus = await statuses.nth(0).boundingBox();
  const secondStatus = await statuses.nth(1).boundingBox();
  expect(Math.abs((firstStatus?.x ?? 0) - (secondStatus?.x ?? 0))).toBeLessThan(
    1,
  );

  const receiptLinks = receipts.getByRole("link", { name: "Receipt" });
  const firstReceipt = await receiptLinks.nth(0).boundingBox();
  const secondReceipt = await receiptLinks.nth(1).boundingBox();
  expect(
    Math.abs((firstReceipt?.x ?? 0) - (secondReceipt?.x ?? 0)),
  ).toBeLessThan(1);
});
