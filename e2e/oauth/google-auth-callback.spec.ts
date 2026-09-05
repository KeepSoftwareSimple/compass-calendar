import { expect, type Page, test } from "@playwright/test";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";

const CALLBACK_PATH = "/auth/google/callback";
const INTENT_STORAGE_PREFIX = "compass.googleAuthorizationIntent";
const REQUIRED_SCOPES = [...GOOGLE_SCOPES];

const getIntentStorageKey = (state: string) =>
  `${INTENT_STORAGE_PREFIX}.${state}`;

// Optional contacts scopes (WP-05/WP-06): requested at consent, but sign-in
// must complete whether or not the user grants them. NEVER move these into
// REQUIRED_SCOPES above — that list is pinned to the callback verification
// and requiring contacts would brick sign-in for everyone who declines.
const OPTIONAL_CONTACTS_SCOPES = [
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
];

const getCallbackUrl = (state: string, grantedScopes = REQUIRED_SCOPES) =>
  `${CALLBACK_PATH}?state=${encodeURIComponent(
    state,
  )}&code=auth-code&scope=${encodeURIComponent(grantedScopes.join(" "))}`;

type MetadataPayload = Record<string, unknown>;

const prepareGoogleAuthCallbackPage = async (
  page: Page,
  options: { metadata?: MetadataPayload } = {},
) => {
  const loginOrSignupRequests: unknown[] = [];
  const metadata = options.metadata ?? {
    google: { connectionState: "HEALTHY" },
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
        body: JSON.stringify({ google: { isConfigured: true } }),
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

test("finishes a saved Google sign-in callback", async ({ page }) => {
  const state = "sign-in-state";
  const apiMocks = await prepareGoogleAuthCallbackPage(page);

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
  expect(
    await page.evaluate(
      (key) => sessionStorage.getItem(key),
      getIntentStorageKey(state),
    ),
  ).toBeNull();
});

// WP-06: the optional contacts grant rides the SAME sign-in callback. Either
// outcome — granted or denied — must land the user signed in on /week with a
// healthy connection; only the suggestContacts capability differs.

const seedSignInIntent = async (page: Page, state: string) => {
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
};

const connectionSummary = (canSuggestContacts: boolean) => ({
  id: "e2e-connection-1",
  state: "healthy",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: "user@example.com",
  connectionState: "HEALTHY",
  canSuggestContacts,
});

const readStoredGoogleMetadata = (page: Page) =>
  page.evaluate(() => {
    const bridge = (
      window as Window & {
        __COMPASS_E2E_STORE__?: {
          userMetadata?: { getState: () => { current: unknown } };
        };
      }
    ).__COMPASS_E2E_STORE__;
    const current = bridge?.userMetadata?.getState().current as
      | {
          google?: {
            connectionState?: string;
            connections?: Array<{ canSuggestContacts?: boolean }>;
          };
        }
      | null
      | undefined;
    return current?.google ?? null;
  });

test("finishes sign-in with the optional contacts scopes granted and surfaces the capability", async ({
  page,
}) => {
  const state = "sign-in-contacts-granted";
  const apiMocks = await prepareGoogleAuthCallbackPage(page, {
    metadata: {
      google: {
        connectionState: "HEALTHY",
        connections: [connectionSummary(true)],
      },
    },
  });

  await seedSignInIntent(page, state);
  await page.goto(
    getCallbackUrl(state, [...REQUIRED_SCOPES, ...OPTIONAL_CONTACTS_SCOPES]),
  );

  await expect(page).toHaveURL(/\/week$/);
  expect(apiMocks.loginOrSignupRequests).toHaveLength(1);

  await expect
    .poll(async () => (await readStoredGoogleMetadata(page))?.connectionState)
    .toBe("HEALTHY");
  const google = await readStoredGoogleMetadata(page);
  expect(google?.connections?.[0]?.canSuggestContacts).toBe(true);
});

test("finishes sign-in when the contacts scopes are denied: connection healthy, capability false", async ({
  page,
}) => {
  const state = "sign-in-contacts-denied";
  const apiMocks = await prepareGoogleAuthCallbackPage(page, {
    metadata: {
      google: {
        connectionState: "HEALTHY",
        connections: [connectionSummary(false)],
      },
    },
  });

  await seedSignInIntent(page, state);
  // The callback grants ONLY the required scopes — the contacts boxes were
  // left unchecked. This must complete exactly like a full grant (no
  // missing-scopes failure, no insufficientScopes / reconnect state).
  await page.goto(getCallbackUrl(state, REQUIRED_SCOPES));

  await expect(page).toHaveURL(/\/week$/);
  expect(apiMocks.loginOrSignupRequests).toHaveLength(1);
  await expect(
    page.getByText(
      "Compass needs all the requested permissions to sync your calendar. Please allow them and try again.",
    ),
  ).not.toBeVisible();

  await expect
    .poll(async () => (await readStoredGoogleMetadata(page))?.connectionState)
    .toBe("HEALTHY");
  const google = await readStoredGoogleMetadata(page);
  expect(google?.connections?.[0]?.canSuggestContacts).toBe(false);
});
