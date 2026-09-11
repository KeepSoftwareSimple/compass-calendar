import { expect, type Page, test } from "@playwright/test";
import { prepareSignedInMicrosoftPage } from "../attendees/attendee-harness";
import { prepareSignedInBookingSettingsPage } from "../booking/booking-harness";

const CONSENT_REQUIRED_COPY =
  "Your organization's admin has to approve Compass before this account can connect.";

const MICROSOFT_AUTHORIZE_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=test";

/** 1 for rgb()/hex with no alpha channel; otherwise the CSS alpha 0-1. */
function cssColorAlpha(color: string): number {
  const slash = color.match(/\/\s*([\d.]+%?)\s*\)/);
  if (slash?.[1]) {
    const token = slash[1];
    return token.endsWith("%") ? Number.parseFloat(token) / 100 : Number(token);
  }
  const rgba = color.match(
    /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/,
  );
  return rgba?.[1] == null ? 1 : Number(rgba[1]);
}

test.use({ viewport: { width: 1600, height: 900 } });

async function stubAnonymousApis(page: Page) {
  await page.addInitScript(() => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
  });

  await page.route("**/api/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
}

test("does not toast success after a Microsoft connected redirect", async ({
  page,
}) => {
  await stubAnonymousApis(page);

  const metadata = page.waitForResponse("**/user/metadata**");
  await page.goto("/week?provider=microsoft&status=connected", {
    waitUntil: "domcontentloaded",
  });
  await metadata;
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  await expect(
    page.getByRole("region", {
      name: "Week calendar horizontal scroll area",
    }),
  ).toBeVisible();
  await expect(page.getByText("Microsoft connected.")).toHaveCount(0);
});

test("shows an account-mismatch toast from the connect-status query", async ({
  page,
}) => {
  await stubAnonymousApis(page);

  await page.goto("/week?provider=microsoft&status=accountMismatch", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByText(
      "That wasn't the same account. Reconnect again and pick the account Compass already has.",
    ),
  ).toBeVisible();
});

test("shows the admin-consent banner for a Microsoft connection", async ({
  page,
}) => {
  await prepareSignedInMicrosoftPage(page, {
    events: [],
    stateReason: "consentRequired",
  });

  await expect(
    page.getByRole("alert").getByText(CONSENT_REQUIRED_COPY),
  ).toBeVisible();
});

test("Add account starts Microsoft OAuth from the chooser", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, { microsoftConnect: true });

  let beginBody: Record<string, unknown> | undefined;
  await page.route("**/api/auth/connections/begin", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    beginBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        kind: "redirect",
        authorizationUrl: MICROSOFT_AUTHORIZE_URL,
      }),
    });
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("button", { name: "Accounts" }).click();
  const addAccount = settingsDialog.getByRole("button", {
    name: "Add account",
  });
  await expect(addAccount).toBeVisible();
  await addAccount.click();
  const menu = settingsDialog.getByRole("menu");
  await expect(menu).toBeVisible();
  const backgroundColor = await menu.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(
    cssColorAlpha(backgroundColor),
    `chooser menu must be opaque, got ${backgroundColor}`,
  ).toBe(1);

  await Promise.all([
    page.waitForURL(
      /login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/,
    ),
    settingsDialog.getByRole("menuitem", { name: "Microsoft" }).click(),
  ]);

  expect(beginBody).toMatchObject({ provider: "microsoft" });
});

test("Add account menu shows a logo for Google, Microsoft, and Apple", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, {
    microsoftConnect: true,
    appleConnect: true,
  });

  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("button", { name: "Accounts" }).click();
  await settingsDialog.getByRole("button", { name: "Add account" }).click();

  const menu = settingsDialog.getByRole("menu");
  await expect(menu).toBeVisible();

  for (const name of ["Google", "Microsoft", "Apple"] as const) {
    const item = settingsDialog.getByRole("menuitem", { name });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toHaveCount(1);
  }
});
