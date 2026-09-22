import { expect, type Page, test } from "@playwright/test";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { providerAuthCallbackPath } from "../../packages/web/src/auth/providers/authorization/provider-authorization.constants";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

const CALLBACK_PATH = providerAuthCallbackPath("google");
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
  const metadata = options.metadata ?? { connections: [] };

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
        body: JSON.stringify({
          version: E2E_APP_CONFIG_VERSION,
          providers: {
            google: { signIn: true, connect: true },
            microsoft: { signIn: false, connect: false },
            apple: { signIn: false, connect: false },
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

// Unchecking a required permission on Google's consent screen used to dump
// the user back on the calendar with a toast and no way to retry.
test("shows the permissions modal and retries with prompt=consent", async ({
  page,
}) => {
  const state = "google-missing-scopes";
  const apiMocks = await prepareGoogleAuthCallbackPage(page);

  await page.goto("/week");
  await page.evaluate(
    ({ key, value }) => {
      sessionStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: getIntentStorageKey(state),
      value: { intent: "signIn", returnPath: "/week", createdAt: Date.now() },
    },
  );

  await page.goto(getCallbackUrl(state, [REQUIRED_SCOPES[0] ?? "openid"]));

  await expect(page).toHaveURL(/\/week$/);
  expect(apiMocks.loginOrSignupRequests).toHaveLength(0);
  const heading = page.getByRole("heading", {
    name: "Compass needs calendar access",
  });
  await expect(heading).toBeVisible();

  let capturedUrl: URL | null = null;
  await page.route("**://accounts.google.com/**", async (route) => {
    capturedUrl = new URL(route.request().url());
    return route.abort();
  });

  await page
    .getByRole("button", { name: "Try again with Google" })
    .click({ noWaitAfter: true });

  await expect
    .poll(() => capturedUrl !== null, { timeout: 5000 })
    .toBe(true)
    .catch(() => undefined);
  if (capturedUrl) {
    expect((capturedUrl as URL).searchParams.get("prompt")).toBe("consent");
  }
});

// Cancelling at Google's consent screen used to share the generic
// authorization error, so a deliberate choice read as a Compass crash.
test("returns the user calmly after a consent-screen cancel", async ({
  page,
}) => {
  const state = "cancelled-state";
  const apiMocks = await prepareGoogleAuthCallbackPage(page);

  await page.goto("/week");
  await page.evaluate(
    ({ key, value }) => {
      sessionStorage.setItem(key, JSON.stringify(value));
    },
    {
      key: getIntentStorageKey(state),
      value: { intent: "signIn", returnPath: "/week", createdAt: Date.now() },
    },
  );

  await page.goto(
    `${CALLBACK_PATH}?state=${encodeURIComponent(state)}&error=access_denied`,
  );

  await expect(
    page.getByText(
      "No problem, nothing was connected. You can sign in anytime.",
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/week$/);
  expect(apiMocks.loginOrSignupRequests).toHaveLength(0);
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

const readStoredConnections = (page: Page) =>
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
          connections?: Array<{
            connectionState?: string;
            canSuggestContacts?: boolean;
          }>;
        }
      | null
      | undefined;
    return current?.connections ?? [];
  });

test("finishes sign-in with the optional contacts scopes granted and surfaces the capability", async ({
  page,
}) => {
  const state = "sign-in-contacts-granted";
  const apiMocks = await prepareGoogleAuthCallbackPage(page, {
    metadata: {
      connections: [connectionSummary(true)],
    },
  });

  await seedSignInIntent(page, state);
  await page.goto(
    getCallbackUrl(state, [...REQUIRED_SCOPES, ...OPTIONAL_CONTACTS_SCOPES]),
  );

  await expect(page).toHaveURL(/\/week$/);
  expect(apiMocks.loginOrSignupRequests).toHaveLength(1);

  await expect
    .poll(async () => (await readStoredConnections(page))[0]?.connectionState)
    .toBe("HEALTHY");
  const connections = await readStoredConnections(page);
  expect(connections[0]?.canSuggestContacts).toBe(true);
});

test("finishes sign-in when the contacts scopes are denied: connection healthy, capability false", async ({
  page,
}) => {
  const state = "sign-in-contacts-denied";
  const apiMocks = await prepareGoogleAuthCallbackPage(page, {
    metadata: {
      connections: [connectionSummary(false)],
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
    page.getByRole("heading", { name: "Compass needs calendar access" }),
  ).not.toBeVisible();

  await expect
    .poll(async () => (await readStoredConnections(page))[0]?.connectionState)
    .toBe("HEALTHY");
  const connections = await readStoredConnections(page);
  expect(connections[0]?.canSuggestContacts).toBe(false);
});
