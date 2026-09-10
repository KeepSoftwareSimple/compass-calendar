import { expect, type Page, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

type ProviderFlags = {
  signIn: boolean;
  connect: boolean;
};

type ProviderConfig = {
  google: ProviderFlags;
  microsoft: ProviderFlags;
  apple: ProviderFlags;
};

const signInOnly = (signIn: boolean): ProviderFlags => ({
  signIn,
  connect: false,
});

const prepareSignInProvidersPage = async (
  page: Page,
  providers?: ProviderConfig,
) => {
  await page.addInitScript(() => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
  });

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith("/api/config")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: E2E_APP_CONFIG_VERSION,
          google: { isConfigured: true },
          ...(providers ? { providers } : {}),
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
};

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("sign-in provider buttons", () => {
  test("renders all three configured providers on the auth modal", async ({
    page,
  }) => {
    await prepareSignInProvidersPage(page, {
      google: signInOnly(true),
      microsoft: signInOnly(true),
      apple: signInOnly(true),
    });

    await page.goto("/week?auth=login", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("dialog", { name: "Hey, welcome back" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Microsoft" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Apple" }),
    ).toBeVisible();
  });

  test("renders only Google when it is the sole configured provider", async ({
    page,
  }) => {
    await prepareSignInProvidersPage(page);

    await page.goto("/week?auth=login", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Microsoft" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continue with Apple" }),
    ).toHaveCount(0);
  });

  test("starts Microsoft sign-in with the M shortcut", async ({ page }) => {
    await prepareSignInProvidersPage(page, {
      google: signInOnly(true),
      microsoft: signInOnly(true),
      apple: signInOnly(false),
    });

    await page.goto("/week?auth=login", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "Continue with Microsoft" }),
    ).toBeVisible();
    await page.getByRole("heading", { name: "Hey, welcome back" }).click();

    await Promise.all([
      page.waitForURL(
        /login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/,
      ),
      page.keyboard.press("m"),
    ]);
  });
});
