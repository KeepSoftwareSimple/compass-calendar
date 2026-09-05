import { expect, type Page, test } from "@playwright/test";
import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";

const CALLBACK_PATH = "/auth/microsoft/callback";
const INTENT_STORAGE_PREFIX = "compass.providerAuthorizationIntent.microsoft";
const REQUIRED_SCOPES = [...MICROSOFT_SCOPES];

const getIntentStorageKey = (state: string) =>
  `${INTENT_STORAGE_PREFIX}.${state}`;

const getCallbackUrl = (state: string, grantedScopes = REQUIRED_SCOPES) =>
  `${CALLBACK_PATH}?state=${encodeURIComponent(
    state,
  )}&code=auth-code&scope=${encodeURIComponent(grantedScopes.join(" "))}`;

type MetadataPayload = Record<string, unknown>;

const prepareMicrosoftAuthCallbackPage = async (
  page: Page,
  options: { metadata?: MetadataPayload } = {},
) => {
  const loginOrSignupRequests: unknown[] = [];
  const metadata = options.metadata ?? {
    microsoft: { connectionState: "HEALTHY" },
  };

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
          user: { emails: ["user@example.com"] },
          createdNewRecipeUser: false,
        }),
      });
    }

    if (url.pathname.endsWith("/api/user/metadata")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(metadata),
      });
    }

    if (url.pathname.endsWith("/api/config")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          providers: {
            microsoft: { signIn: true, connect: true },
          },
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

test("finishes a saved Microsoft sign-in callback", async ({ page }) => {
  const state = "microsoft-sign-in-state";
  const apiMocks = await prepareMicrosoftAuthCallbackPage(page);

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
      thirdPartyId: "active-directory",
      redirectURIInfo: expect.objectContaining({
        redirectURIQueryParams: expect.objectContaining({
          code: "auth-code",
          state,
        }),
      }),
    }),
  );
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      getIntentStorageKey(state),
    ),
  ).toBeNull();
});

test("rejects a Microsoft callback that is missing required scopes", async ({
  page,
}) => {
  const state = "microsoft-missing-scopes";
  const apiMocks = await prepareMicrosoftAuthCallbackPage(page);

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

  await page.goto(getCallbackUrl(state, [REQUIRED_SCOPES[0] ?? "openid"]));

  await expect(page).toHaveURL(/\/week$/);
  expect(apiMocks.loginOrSignupRequests).toHaveLength(0);
  await expect(
    page.getByText(
      "Compass needs all the requested permissions to sync your calendar. Please allow them and try again.",
    ),
  ).toBeVisible();
});
