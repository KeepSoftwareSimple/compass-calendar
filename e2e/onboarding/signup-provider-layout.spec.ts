import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ storageState: { cookies: [], origins: [] } });

const mockAllSignInProviders = async (
  page: import("@playwright/test").Page,
) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: E2E_APP_CONFIG_VERSION,
        providers: {
          google: { signIn: true, connect: true },
          microsoft: { signIn: true, connect: true },
          apple: { signIn: true, connect: true },
        },
      }),
    });
  });
};

const expectSignupProviderLayout = async (
  page: import("@playwright/test").Page,
) => {
  const dialog = page.getByRole("dialog", { name: "Nice to meet you" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Connect a calendar account" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Pick Google, Microsoft, or Apple"),
  ).toHaveCount(0);
  for (const label of [
    /Continue with Google/i,
    /Continue with Microsoft/i,
    /Continue with Apple/i,
  ]) {
    await expect(dialog.getByRole("button", { name: label })).toBeVisible();
  }
};

test.describe("signup provider layout at 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("shows all provider buttons without the connect-calendar heading", async ({
    page,
  }) => {
    await mockAllSignInProviders(page);
    await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });
    await expectSignupProviderLayout(page);
  });
});

test("signup field jumps work while typing and preserve numbers", async ({
  page,
}) => {
  await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });
  const email = page.getByRole("textbox", { name: "Email", exact: true });
  const name = page.getByRole("textbox", { name: "Name", exact: true });
  const password = page.getByLabel("Password", { exact: true });
  await expect(email).toBeFocused();
  await page.keyboard.type("ada123@example.com");
  await page.keyboard.press("ControlOrMeta+1");
  await expect(name).toBeFocused();
  await page.keyboard.type("Ada2");
  await page.keyboard.press("ControlOrMeta+3");
  await expect(password).toBeFocused();
  await page.keyboard.type("a-password-123");
  await page.keyboard.press("ControlOrMeta+2");
  await expect(email).toBeFocused();
  await expect(email).toHaveValue("ada123@example.com");
  await expect(name).toHaveValue("Ada2");
  await expect(password).toHaveValue("a-password-123");
});

test.describe("signup provider layout at 360", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("shows all provider buttons above the fold", async ({ page }) => {
    await mockAllSignInProviders(page);
    await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });
    await expectSignupProviderLayout(page);
  });
});
