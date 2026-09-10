import { expect, test } from "@playwright/test";
import { prepareSignedInMicrosoftPage } from "../attendees/attendee-harness";
import { prepareSignedInBookingSettingsPage } from "../booking/booking-harness";
import { expectNoAxeViolations } from "../utils/axe-assertion";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

function jsonResponse(body: unknown) {
  return {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  };
}

async function prepareSignedInZeroConnectionsPage(
  page: import("@playwright/test").Page,
) {
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
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (path.endsWith("/api/calendars")) {
      return route.fulfill(jsonResponse({ calendars: [] }));
    }

    if (path.endsWith("/api/event") && request.method() === "GET") {
      return route.fulfill(jsonResponse({ events: [] }));
    }

    if (path.endsWith("/api/user/metadata")) {
      return route.fulfill(
        jsonResponse({
          google: { connectionState: "NOT_CONNECTED", connections: [] },
          connections: [],
        }),
      );
    }

    if (path.endsWith("/api/config")) {
      return route.fulfill(
        jsonResponse({
          version: E2E_APP_CONFIG_VERSION,
          google: { isConfigured: true },
          providers: {
            google: { signIn: true, connect: true },
            microsoft: { signIn: true, connect: true },
            apple: { signIn: false, connect: true },
          },
        }),
      );
    }

    return route.fulfill(jsonResponse({}));
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });
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
  await expect(
    page.getByRole("dialog", { name: "Connect the calendar you use" }),
  ).toBeVisible({ timeout: 15000 });
}

test("the connect-calendar onboarding step has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await welcomeDialog.getByRole("button", { name: "Next" }).click();
  await expect(
    welcomeDialog.getByRole("heading", {
      name: "Connect the calendar you use",
    }),
  ).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "connect calendar onboarding",
    include: '[role="dialog"][aria-label="Welcome to Compass Calendar"]',
  });
});

test("the signed-in connect-calendar prompt has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await prepareSignedInZeroConnectionsPage(page);

  await expectNoAxeViolations(page, {
    checkpoint: "signed-in connect calendar prompt",
    include: '[role="dialog"][aria-label="Connect the calendar you use"]',
  });
});

test("the add-account chooser with Google and Microsoft has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, { microsoftConnect: true });
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("button", { name: "Accounts" }).click();
  const addAccount = settingsDialog.getByRole("button", {
    name: "Add account",
  });
  await expect(addAccount).toBeVisible();
  await addAccount.click();
  await expect(settingsDialog.getByRole("menu")).toBeVisible();
  await expect(
    settingsDialog.getByRole("menuitem", { name: "Microsoft" }),
  ).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "settings add-account chooser",
    include: "[role='menu']",
  });
});

test("the Microsoft admin-consent banner has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await prepareSignedInMicrosoftPage(page, {
    events: [],
    stateReason: "consentRequired",
  });

  const banner = page
    .getByRole("alert")
    .getByText(
      "Your organization's admin has to approve Compass before this account can connect.",
    );
  await expect(banner).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "microsoft consent required banner",
    include: "[role='alert']",
  });
});
