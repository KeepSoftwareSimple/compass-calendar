import { expect, type Page, test } from "@playwright/test";
import { getViewSwitcherButton } from "../utils/event-test-utils";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

// Issue #5033: a browser that still holds an expired Compass session must land
// in a usable app. A returning account gets one clean sign-in prompt; a
// local-only visitor gets the calendar. Neither is left on "Loading events".

test.use({
  storageState: { cookies: [], origins: [] },
  viewport: { width: 1280, height: 800 },
});

const jsonResponse = (status: number, body: unknown) => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body),
});

/**
 * SuperTokens' readable front token, already past its access-token expiry.
 * Crafted for the test; it never matched a real session.
 */
function expiredFrontToken(): string {
  const payload = {
    uid: "stale-session-user",
    ate: Date.now() - 60 * 60 * 1000,
    up: { sub: "stale-session-user", exp: 1 },
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

async function prepareStaleSessionPage(
  page: Page,
  { hasAuthenticated }: { hasAuthenticated: boolean },
) {
  await page.context().addCookies([
    {
      name: "sFrontToken",
      value: expiredFrontToken(),
      domain: "localhost",
      path: "/",
    },
  ]);

  await page.addInitScript((returning) => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
    if (returning) {
      localStorage.setItem(
        "compass.auth",
        JSON.stringify({
          hasAuthenticated: true,
          lastKnownEmail: "returning@example.com",
        }),
      );
    }
  }, hasAuthenticated);

  const refreshAttempts: string[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;

    if (path.endsWith("/api/config")) {
      return route.fulfill(
        jsonResponse(200, {
          version: E2E_APP_CONFIG_VERSION,
          providers: {
            google: { signIn: true, connect: true },
            microsoft: { signIn: false, connect: false },
            apple: { signIn: false, connect: false },
          },
          billing: { isConfigured: false },
        }),
      );
    }

    if (path.endsWith("/api/session/refresh")) {
      refreshAttempts.push(path);
      return route.fulfill(jsonResponse(401, { message: "unauthorised" }));
    }

    // Every account-scoped endpoint rejects the stale session.
    return route.fulfill(jsonResponse(401, { message: "unauthorised" }));
  });

  return { refreshAttempts };
}

test.describe("stale session on a returning browser", () => {
  test("a returning account gets one sign-in prompt and no endless loading", async ({
    page,
  }) => {
    await prepareStaleSessionPage(page, { hasAuthenticated: true });

    await page.goto("/week", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("dialog", { name: "Hey, welcome back" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("status", { name: "Loading events" }),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByText("You've been signed out")).toHaveCount(0);

    // Stays settled: nothing re-enters loading or stacks a second prompt.
    await page.waitForTimeout(1_500);
    await expect(
      page.getByRole("status", { name: "Loading events" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "Hey, welcome back" }),
    ).toHaveCount(1);

    // Closing the prompt must not release a toast that queued behind it.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Hey, welcome back" }),
    ).toHaveCount(0);
    await page.waitForTimeout(1_000);
    await expect(page.getByText("You've been signed out")).toHaveCount(0);
    await expect(
      page.getByRole("status", { name: "Loading events" }),
    ).toHaveCount(0);
  });

  test("a local-only visitor gets the calendar with no sign-in prompt", async ({
    page,
  }) => {
    await prepareStaleSessionPage(page, { hasAuthenticated: false });

    await page.goto("/week", { waitUntil: "domcontentloaded" });

    await expect(getViewSwitcherButton(page)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("status", { name: "Loading events" }),
    ).toHaveCount(0, { timeout: 10_000 });
    await expect(
      page.getByRole("dialog", { name: "Hey, welcome back" }),
    ).toHaveCount(0);
    await expect(page.getByText("You've been signed out")).toHaveCount(0);
  });
});
