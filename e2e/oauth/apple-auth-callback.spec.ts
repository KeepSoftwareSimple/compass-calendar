import { expect, type Page, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

const CALLBACK_PATH = "/auth/apple/callback";
const INTENT_STORAGE_PREFIX = "compass.appleAuthorizationIntent";

const getIntentStorageKey = (state: string) =>
  `${INTENT_STORAGE_PREFIX}.${state}`;

const getCallbackUrl = (state: string) =>
  `${CALLBACK_PATH}?state=${encodeURIComponent(state)}&code=auth-code`;

const prepareAppleAuthCallbackPage = async (page: Page) => {
  const loginOrSignupRequests: unknown[] = [];

  await page.addInitScript(() => {
    (
      window as Window & { __COMPASS_E2E_TEST__?: boolean }
    ).__COMPASS_E2E_TEST__ = true;
    window.alert = () => undefined;
    window.confirm = () => true;
    window.prompt = () => null;
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname.endsWith("/api/signinup")) {
      loginOrSignupRequests.push(request.postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { emails: ["hidden@privaterelay.appleid.com"] },
        }),
      });
    }

    if (url.pathname.endsWith("/api/user/metadata")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    }

    if (url.pathname.endsWith("/api/config")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          version: E2E_APP_CONFIG_VERSION,
          google: { isConfigured: true },
          apple: { signIn: true, calendar: false },
        }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  return { loginOrSignupRequests };
};

test("finishes a saved Apple Sign in callback without connecting a calendar", async ({
  page,
}) => {
  const state = "apple-sign-in-state";
  const apiMocks = await prepareAppleAuthCallbackPage(page);

  await page.goto("/week");
  await page.evaluate(
    ({ key, value }) => {
      sessionStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: getIntentStorageKey(state),
      value: {
        intent: "signIn",
        returnPath: "/week",
        createdAt: Date.now(),
      },
    },
  );

  await page.goto(getCallbackUrl(state));

  await expect(
    page.locator('[role="status"][aria-live="polite"]'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/week$/);
  expect(apiMocks.loginOrSignupRequests).toHaveLength(1);
  expect(apiMocks.loginOrSignupRequests[0]).toEqual(
    expect.objectContaining({
      thirdPartyId: "apple",
    }),
  );
  expect(JSON.stringify(apiMocks.loginOrSignupRequests[0])).not.toContain(
    "calendar",
  );
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      getIntentStorageKey(state),
    ),
  ).toBeNull();
});
