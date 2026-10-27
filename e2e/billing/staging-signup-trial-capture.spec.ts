import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const TRIAL_PRICE_LINE =
  /\$\d+\.\d{2}\/mo after 7 days\. Cancel anytime in Settings\./;

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

  await expect(page.getByLabel("Password")).toHaveCount(0, {
    timeout: 120_000,
  });

  const exploreBanner = page.getByRole("status").filter({
    hasText: "Start your 7-day free trial to plan your week.",
  });
  await expect(exploreBanner).toBeVisible({ timeout: 120_000 });
  await expect(
    exploreBanner.getByRole("button", { name: /Start free trial/i }),
  ).toBeVisible();

  await page.goto(`${baseUrl}/week?auth=trial`, {
    waitUntil: "domcontentloaded",
  });

  const dialog = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await expect(dialog).toBeVisible({ timeout: 120_000 });
  await expect(dialog.getByText(TRIAL_PRICE_LINE)).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Start free trial" }).click();

  await expect(dialog.getByRole("button", { name: "Back" })).toBeVisible({
    timeout: 120_000,
  });

  await expect
    .poll(() => checkoutClientSecret.length > 0, { timeout: 120_000 })
    .toBe(true);
  expect(checkoutClientSecret).toMatch(/^cs_/);

  const stripeFrame = page
    .frameLocator('iframe[name*="stripe"], iframe[src*="stripe"]')
    .first();
  await stripeFrame.getByLabel("Card number").fill("4242424242424242");
  await stripeFrame.getByLabel("Expiration").fill("12/34");
  await stripeFrame.getByRole("textbox", { name: /CVC/i }).fill("123");
  await stripeFrame.getByLabel("ZIP").fill("12345");
  await expect(
    stripeFrame.getByTestId("hosted-payment-submit-button"),
  ).toBeVisible();

  await dialog.screenshot({
    path: "/opt/cursor/artifacts/signup-trial-step-staging-stripe-1280.png",
  });
  await dialog.screenshot({
    path: test.info().outputPath("signup-trial-step-staging-stripe-1280.png"),
  });

  if (process.env.STAGING_TRIAL_SUBMIT_CHECKOUT === "1") {
    await stripeFrame.getByTestId("hosted-payment-submit-button").click({
      timeout: 120_000,
    });
    await expect(page.getByText("You're aboard!")).toBeVisible({
      timeout: 300_000,
    });
    const cookieHeader = (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `${baseUrl}/api/billing/status`,
            {
              headers: cookieHeader ? { cookie: cookieHeader } : {},
            },
          );
          if (!response.ok()) return "pending";
          const body = (await response.json()) as {
            subscriptionStatus?: string;
          };
          return body.subscriptionStatus ?? "pending";
        },
        { timeout: 300_000 },
      )
      .toMatch(/trialing|active/);
  }

  test.info().attach("staging-publishable-key-prefix", {
    body: publishableKey ? publishableKey.slice(0, 12) : "missing",
    contentType: "text/plain",
  });
  test.info().attach("checkout-client-secret-prefix", {
    body: checkoutClientSecret.slice(0, 12) || "missing",
    contentType: "text/plain",
  });
});
