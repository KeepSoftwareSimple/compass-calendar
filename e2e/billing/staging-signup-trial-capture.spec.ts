import { expect, type FrameLocator, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const TRIAL_PRICE_LINE =
  /\$\d+\.\d{2}\/mo after 7 days\. Cancel anytime in Settings\./;

async function fillStripeTrialCheckout(
  stripeFrame: FrameLocator,
): Promise<void> {
  await stripeFrame.getByLabel("Card number").fill("4242424242424242");
  await stripeFrame.getByLabel("Expiration").fill("12/34");
  await stripeFrame.getByRole("textbox", { name: /CVC/i }).fill("123");
  await stripeFrame.getByLabel(/Cardholder name/i).fill("Staging Trial");
  await stripeFrame.getByLabel("Country or region").selectOption("US");

  const addressLine = stripeFrame
    .getByLabel(/^Address$/i)
    .or(stripeFrame.getByLabel(/Address line 1/i))
    .first();
  await addressLine.fill("123 Main St");
  await expect(addressLine).toHaveValue("123 Main St");

  await stripeFrame.getByLabel(/City/i).fill("Denver");

  const stateField = stripeFrame
    .getByLabel(/^State$/i)
    .or(stripeFrame.getByRole("combobox", { name: /^State$/i }));
  await stateField.selectOption({ label: "Colorado" });

  await stripeFrame.getByLabel("ZIP").fill("80202");

  const linkSave = stripeFrame.locator("#enableStripePass");
  if (await linkSave.isVisible().catch(() => false)) {
    if (await linkSave.isChecked().catch(() => false)) {
      await linkSave.click({ force: true });
    }
    if (await linkSave.isChecked().catch(() => false)) {
      const phone = stripeFrame.getByRole("textbox", { name: /Phone/i });
      if (await phone.isVisible().catch(() => false)) {
        await phone.click();
        await phone.fill("");
        await phone.fill("(303) 555-0100");
        await expect(phone).toHaveValue(/303/);
      }
    } else {
      await expect(
        stripeFrame.getByRole("textbox", { name: /Phone/i }),
      ).toHaveCount(0);
    }
  }

  await expect(
    stripeFrame.getByTestId("hosted-payment-submit-button"),
  ).toBeEnabled({ timeout: 30_000 });
}

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
  await fillStripeTrialCheckout(stripeFrame);
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
    await dialog.screenshot({
      path: "/opt/cursor/artifacts/staging-checkout-before-submit.png",
    });

    await stripeFrame.getByTestId("hosted-payment-submit-button").click({
      timeout: 120_000,
    });

    const celebration = page.getByText("You're aboard!");
    try {
      await expect(celebration).toBeVisible({ timeout: 300_000 });
    } catch (error) {
      await dialog.screenshot({
        path: "/opt/cursor/artifacts/staging-checkout-submit-failed-dialog.png",
      });
      const stripeText = await stripeFrame.locator("body").innerText();
      test.info().attach("stripe-frame-text-on-failure", {
        body: stripeText.slice(0, 4000),
        contentType: "text/plain",
      });
      throw error;
    }
    await page.screenshot({
      path: "/opt/cursor/artifacts/staging-checkout-after-submit.png",
      fullPage: true,
    });

    const cookieHeader = (await page.context().cookies())
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");

    const readBillingStatus = async (): Promise<string> => {
      const response = await page.request.get(`${baseUrl}/api/billing/status`, {
        headers: cookieHeader ? { cookie: cookieHeader } : {},
      });
      if (!response.ok()) return "http_error";
      const body = (await response.json()) as { subscriptionStatus?: string };
      return body.subscriptionStatus ?? "unknown";
    };

    let finalBillingStatus = "unknown";
    await expect
      .poll(
        async () => {
          finalBillingStatus = await readBillingStatus();
          return finalBillingStatus;
        },
        { timeout: 300_000 },
      )
      .toMatch(/trialing|active/);

    test.info().attach("staging-post-submit-billing-status", {
      body: finalBillingStatus,
      contentType: "text/plain",
    });
    test.info().attach("checkout-client-secret-for-stripe-dashboard", {
      body: checkoutClientSecret,
      contentType: "text/plain",
    });
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
