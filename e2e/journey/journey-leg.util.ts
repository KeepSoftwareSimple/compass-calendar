import {
  expect,
  type FrameLocator,
  type Locator,
  type Page,
} from "@playwright/test";
import { redactJourneyEmailForLog } from "@core/analytics/synthetic-account.util";
import {
  clearPendingJourneyAccount,
  writePendingJourneyAccount,
} from "./journey-pending-account.util";

/**
 * The staging and prod journey legs run the same account lifecycle against
 * different deployments, so every selector fix has to land twice. It did not:
 * the prod leg still carried pre-#4857/#4860 selectors for settings, logout,
 * and delete-account long after the staging leg was fixed. The shared steps
 * live here so a fix reaches both legs.
 */
export type JourneyScope = "STAGING" | "PROD";

export type JourneyCredentials = {
  readonly provider: string;
  readonly accountEmail: string;
  readonly password: string;
};

/** Must match DELETE_ACCOUNT_PHRASE; the dialog compares it exactly. */
const DELETE_ACCOUNT_PHRASE = "Delete my Compass account";

export const journeyProvider = (scope: JourneyScope): string =>
  (process.env[`${scope}_JOURNEY_PROVIDER`] ?? "").toLowerCase();

export const isJourneyEnabled = (scope: JourneyScope): boolean =>
  process.env[`${scope}_JOURNEY_ENABLED`] === "1";

const requireEnv = (scope: JourneyScope, name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to the ${scope.toLowerCase()}-journey GitHub Environment secrets before this leg can run.`,
    );
  }
  return value;
};

/** Per-provider credential secrets, e.g. `STAGING_JOURNEY_GOOGLE_EMAIL`. */
export const journeyCredentials = (scope: JourneyScope): JourneyCredentials => {
  const provider = journeyProvider(scope);
  if (
    provider !== "google" &&
    provider !== "microsoft" &&
    provider !== "apple"
  ) {
    throw new Error(
      `${scope}_JOURNEY_PROVIDER must be google, microsoft, or apple (got "${provider}").`,
    );
  }
  const prefix = `${scope}_JOURNEY_${provider.toUpperCase()}`;
  return {
    provider,
    accountEmail: requireEnv(scope, `${prefix}_EMAIL`),
    password: requireEnv(scope, `${prefix}_PASSWORD`),
  };
};

/**
 * Onboarding surfaces steal focus from the grid shortcuts the legs drive.
 * `snoozeConnectPrompt` pre-dismisses the connect sidebar so keyboard
 * shortcuts are not blocked after signup (both journey legs pass this).
 */
export const seedJourneyOnboarding = async (
  page: Page,
  { snoozeConnectPrompt = false }: { snoozeConnectPrompt?: boolean } = {},
) => {
  await page.addInitScript(
    ({ snoozeConnect }: { snoozeConnect: boolean }) => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem(
        "compass.onboarding.has-seen-shortcut-showcase",
        "true",
      );
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      if (snoozeConnect) {
        localStorage.setItem(
          "compass.onboarding.has-dismissed-connect-calendar-prompt",
          String(Date.now()),
        );
      }
    },
    { snoozeConnect: snoozeConnectPrompt },
  );
};

/** A fresh address per run, so a leg never collides with its own leftovers. */
export const uniqueJourneyEmail = (accountEmail: string): string =>
  accountEmail.includes("@")
    ? accountEmail.replace("@", `+journey${Date.now()}@`)
    : `journey.${Date.now()}@compasscaltest.invalid`;

export const signUpJourneyAccount = async (
  page: Page,
  { name, email, password }: { name: string; email: string; password: string },
) => {
  await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();
};

/** Signup closes the auth modal; the trial step is opened explicitly via URL. */
export const waitForJourneySignUpComplete = async (page: Page) => {
  await expect(page.getByLabel("Password")).toHaveCount(0, {
    timeout: 120_000,
  });
};

export const openJourneyTrialStep = async (page: Page) => {
  await page.goto("/week?auth=trial", { waitUntil: "domcontentloaded" });
  const trialDialog = page.getByRole("dialog", {
    name: "Start your 7-day free trial",
  });
  await expect(trialDialog).toBeVisible({ timeout: 120_000 });
  return trialDialog;
};

export const logInJourneyAccount = async (
  page: Page,
  { email, password }: { email: string; password: string },
) => {
  await page.goto("/week?auth=login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
};

/** The sidebar control is labelled "Open settings"; the panel title is "Settings". */
export const openJourneySettings = async (page: Page) => {
  await page.getByRole("button", { name: "Open settings" }).click();
  const settings = page.getByRole("dialog", { name: "Settings" });
  await expect(settings).toBeVisible({ timeout: 15_000 });
  return settings;
};

export const logOutOfJourneyAccount = async (page: Page) => {
  await openJourneySettings(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await page
    .getByRole("dialog", { name: /log out/i })
    .getByRole("button", { name: "Log out" })
    .click();
};

const requireStripeFieldVisible = async (
  fieldName: string,
  locator: Locator,
): Promise<void> => {
  try {
    await expect(locator).toBeVisible({ timeout: 60_000 });
  } catch {
    throw new Error(`Stripe checkout missing required field: ${fieldName}`);
  }
};

export const collectStripeHostedCheckoutValidationErrors = async (
  stripeFrame: FrameLocator,
): Promise<string[]> => {
  const errorLocators = stripeFrame.locator(
    '[class*="FieldError"], [class*="ErrorMessage"], [data-testid*="error" i], [role="alert"]',
  );
  const count = await errorLocators.count().catch(() => 0);
  const messages: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const text = (
      await errorLocators
        .nth(index)
        .innerText()
        .catch(() => "")
    )
      .replace(/\s+/g, " ")
      .trim();
    if (text) messages.push(text);
  }
  return [...new Set(messages)];
};

/**
 * When Stripe renders billing address fields, every visible required input
 * must be filled or the leg fails immediately with the missing field name.
 */
export const fillJourneyCheckoutBillingAddressIfVisible = async (
  stripeFrame: FrameLocator,
) => {
  const country = stripeFrame.getByLabel("Country or region");
  if (!(await country.isVisible().catch(() => false))) return;

  await requireStripeFieldVisible("country", country);
  await country.selectOption("US");

  const name = stripeFrame
    .getByLabel(/^Full name$/i)
    .or(stripeFrame.getByLabel(/^Name$/i))
    .or(stripeFrame.getByLabel(/Cardholder name/i))
    .first();
  if (await name.isVisible().catch(() => false)) {
    await requireStripeFieldVisible("name", name);
    await name.fill("Prod Journey Billing");
  }

  const addressLine = stripeFrame
    .getByLabel(/^Address$/i)
    .or(stripeFrame.getByLabel(/Address line 1/i))
    .first();
  await requireStripeFieldVisible("address line 1", addressLine);
  await addressLine.fill("123 Main St");

  const city = stripeFrame.getByLabel(/^City$/i);
  await requireStripeFieldVisible("city", city);
  await city.fill("Denver");

  const stateField = stripeFrame
    .getByLabel(/^State$/i)
    .or(stripeFrame.getByRole("combobox", { name: /^State$/i }));
  if (await stateField.isVisible().catch(() => false)) {
    await requireStripeFieldVisible("state", stateField);
    await stateField.selectOption({ label: "Colorado" });
  }

  const zip = stripeFrame.getByLabel(/^ZIP$/i);
  await requireStripeFieldVisible("ZIP", zip);
  await zip.fill("80202");
};

export const registerJourneyAccountForCleanup = async (
  scope: JourneyScope,
  { email, password }: { email: string; password: string },
): Promise<void> => {
  await writePendingJourneyAccount({
    scope,
    email,
    password,
    createdAtMs: Date.now(),
  });
};

export const waitForSyntheticProdJourneyCheckoutSuccess = async (
  page: Page,
  stripeFrame: FrameLocator,
  trialDialog: Locator,
  { timeoutMs = 180_000 }: { timeoutMs?: number } = {},
): Promise<void> => {
  const celebration = page.getByRole("dialog", { name: "You're aboard!" });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await celebration.isVisible().catch(() => false)) {
      await expect(trialDialog).toBeHidden({ timeout: 30_000 });
      return;
    }
    if (!(await trialDialog.isVisible().catch(() => false))) {
      return;
    }

    const errors =
      await collectStripeHostedCheckoutValidationErrors(stripeFrame);
    if (errors.length > 0) {
      throw new Error(
        `Stripe checkout validation failed: ${errors.join("; ")}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const errors = await collectStripeHostedCheckoutValidationErrors(stripeFrame);
  if (errors.length > 0) {
    throw new Error(`Stripe checkout validation failed: ${errors.join("; ")}`);
  }

  const stripeText = await stripeFrame
    .locator("body")
    .innerText()
    .catch(() => "");
  throw new Error(
    stripeText.trim()
      ? `Prod journey checkout did not complete: ${stripeText.slice(0, 500)}`
      : "Prod journey checkout did not complete: trial dialog still open after submit",
  );
};

/** Stripe Link can require a phone when save is checked; prod uses no card. */
export const dismissStripeLinkSaveIfChecked = async (
  stripeFrame: FrameLocator,
) => {
  const linkSave = stripeFrame.locator("#enableStripePass");
  if (!(await linkSave.isVisible().catch(() => false))) return;

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
};

export const submitSyntheticProdJourneyCheckout = async (
  stripeFrame: FrameLocator,
) => {
  const cardField = stripeFrame.getByLabel("Card number");
  if (await cardField.isVisible().catch(() => false)) {
    throw new Error(
      "Synthetic prod checkout expected no card field (100% discount with payment_method_collection if_required). Verify production deploy wrote SYNTHETIC_JOURNEY_EMAILS and STRIPE_SYNTHETIC_JOURNEY_DISCOUNT_ID.",
    );
  }

  await fillJourneyCheckoutBillingAddressIfVisible(stripeFrame);
  await dismissStripeLinkSaveIfChecked(stripeFrame);
  await expect(
    stripeFrame.getByTestId("hosted-payment-submit-button"),
  ).toBeEnabled({ timeout: 120_000 });
  await stripeFrame.getByTestId("hosted-payment-submit-button").click({
    timeout: 120_000,
  });
};

export const cancelJourneySubscriptionIfActive = async (page: Page) => {
  const settings = await openJourneySettings(page);
  const cancelButton = settings.getByRole("button", {
    name: "Cancel subscription",
  });
  if (!(await cancelButton.isVisible().catch(() => false))) {
    await page.keyboard.press("Escape");
    return;
  }
  await cancelButton.click();
  const confirm = page
    .getByRole("dialog", { name: /cancel/i })
    .getByRole("button", { name: "Cancel subscription" });
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
    await expect(page.getByText(/canceled|cancelled/i)).toBeVisible({
      timeout: 60_000,
    });
  }
  await page.keyboard.press("Escape");
};

export const resolveJourneyPasswordForCleanupEmail = (
  scope: JourneyScope,
  email: string,
): string => {
  const normalized = email.trim().toLowerCase();
  if (scope === "PROD") {
    const match = normalized.match(/prod-journey-(google|microsoft|apple)/);
    if (!match) {
      throw new Error(
        `Cannot resolve prod journey password for ${redactJourneyEmailForLog(email)}`,
      );
    }
    process.env.PROD_JOURNEY_PROVIDER = match[1];
    return journeyCredentials("PROD").password;
  }

  for (const provider of ["google", "microsoft", "apple"] as const) {
    process.env.STAGING_JOURNEY_PROVIDER = provider;
    try {
      const { accountEmail, password } = journeyCredentials("STAGING");
      const base = accountEmail.trim().toLowerCase();
      const at = normalized.indexOf("@");
      const local = at >= 0 ? normalized.slice(0, at) : normalized;
      const baseLocal = base.includes("@")
        ? base.slice(0, base.indexOf("@"))
        : base;
      if (local === baseLocal || local.startsWith(`${baseLocal}+`)) {
        return password;
      }
    } catch {
      // Try the next configured provider secret set.
    }
  }

  throw new Error(
    `Cannot resolve staging journey password for ${redactJourneyEmailForLog(email)}`,
  );
};

/** Prod leg teardown outside the main test timeout budget. */
export const cleanupProdJourneyAccount = async (
  page: Page,
  {
    email,
    password,
    scope = "PROD",
  }: { email: string; password: string; scope?: JourneyScope },
) => {
  await page
    .goto("/week", { waitUntil: "domcontentloaded" })
    .catch(() => undefined);
  const onCalendar =
    (await page
      .locator("#mainGrid")
      .isVisible()
      .catch(() => false)) ||
    (await page
      .getByRole("button", { name: "Open settings" })
      .isVisible()
      .catch(() => false));
  if (!onCalendar) {
    await logInJourneyAccount(page, { email, password }).catch(() => undefined);
    await page
      .locator("#mainGrid")
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(() => undefined);
  }
  await cancelJourneySubscriptionIfActive(page).catch(() => undefined);
  await deleteJourneyAccount(page);
  await clearPendingJourneyAccount(scope);
  console.log(
    `Journey cleanup confirmed for ${redactJourneyEmailForLog(email)}`,
  );
};

export const deleteJourneyAccount = async (page: Page) => {
  const settings = await openJourneySettings(page);
  await settings.getByRole("button", { name: "Delete account" }).click();
  const deleteDialog = page.getByRole("dialog", {
    name: /delete your compass account/i,
  });
  await expect(deleteDialog).toBeVisible({ timeout: 15_000 });
  await deleteDialog.getByLabel(/type/i).fill(DELETE_ACCOUNT_PHRASE);
  await deleteDialog.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText(/until our sails cross paths/i)).toBeVisible({
    timeout: 60_000,
  });
};
