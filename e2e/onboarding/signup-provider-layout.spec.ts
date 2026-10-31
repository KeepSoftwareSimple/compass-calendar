import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 900 } });

test("signup shows provider buttons without the connect-calendar heading", async ({
  page,
}) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: E2E_APP_CONFIG_VERSION,
        providers: {
          google: { signIn: true, connect: true },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
      }),
    });
  });

  await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });

  const dialog = page.getByRole("dialog", { name: "Nice to meet you" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Connect a calendar account" }),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Pick Google, Microsoft, or Apple"),
  ).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: /Continue with Google/i }),
  ).toBeVisible();
});
