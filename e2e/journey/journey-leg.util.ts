import { expect, type Page } from "@playwright/test";

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
 * `snoozeConnectPrompt` also pre-dismisses the connect sidebar, which only the
 * staging leg can skip (the prod leg asserts the trial dialog first).
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
