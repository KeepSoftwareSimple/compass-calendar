import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

test("staging signup trial step with live Stripe embedded checkout", async ({
  page,
}) => {
  test.skip(
    process.env.STAGING_SIGNUP_TRIAL_CAPTURE !== "1",
    "Set STAGING_SIGNUP_TRIAL_CAPTURE=1 to run against staging",
  );

  const baseUrl =
    process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

  let publishableKey: string | null = null;
  let checkoutClientSecret = "";

  const configResponse = await page.request.get(`${baseUrl}/api/config`);
  expect(configResponse.ok()).toBe(true);
  const config = (await configResponse.json()) as {
    billing?: { publishableKey?: string | null };
  };
  publishableKey = config.billing?.publishableKey ?? null;
  expect(publishableKey).toMatch(/^pk_(test|live)_/);

  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith("/api/billing/checkout/session")) return;
    if (!response.ok()) return;
    try {
      const body = (await response.json()) as { clientSecret?: string };
      checkoutClientSecret = body.clientSecret ?? "";
    } catch {
      // ignore parse errors
    }
  });

  await page.goto(`${baseUrl}/week?auth=signup`, {
    waitUntil: "domcontentloaded",
  });

  const email = `agent.trial.${Date.now()}@compasscaltest.invalid`;
  await page.getByLabel("Name").fill("Staging Trial");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("CompassStagingTrial1!");
  await page.getByRole("button", { name: "Sign up" }).click();

  const dialog = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await expect(dialog).toBeVisible({ timeout: 120000 });
  const terms = dialog.getByText(
    /Card required\. No charge until the trial ends\.|7-day free trial\. Card required, no charge until it ends\./,
  );
  await expect(terms).toBeVisible({ timeout: 30000 });
  await expect(dialog.getByRole("button", { name: "Back" })).toBeVisible();

  await expect
    .poll(() => checkoutClientSecret.length > 0, { timeout: 120000 })
    .toBe(true);
  expect(checkoutClientSecret).toMatch(/^cs_/);

  const stripeFrame = page
    .frameLocator('iframe[name*="stripe"], iframe[src*="stripe"]')
    .first();
  await stripeFrame.locator("input").first().waitFor({ timeout: 120000 });

  await expect(
    dialog.locator("button.c-button-primary", { hasText: "Start free trial" }),
  ).toHaveCount(0);

  await dialog.screenshot({
    path: test.info().outputPath("signup-trial-step-staging-stripe-1280.png"),
  });

  test.info().attach("staging-publishable-key-prefix", {
    body: publishableKey ? publishableKey.slice(0, 12) : "missing",
    contentType: "text/plain",
  });
  test.info().attach("checkout-client-secret-prefix", {
    body: checkoutClientSecret.slice(0, 12) || "missing",
    contentType: "text/plain",
  });
});
