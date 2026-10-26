import "@testing-library/jest-dom";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GOOGLE_SCOPE_CALENDAR_EVENTS } from "@core/providers/google.scopes";
import {
  registerUseStartProviderAuthorizationForTests,
  resetUseStartProviderAuthorizationForTests,
} from "@web/auth/providers/authorization/useStartProviderAuthorization";
import {
  missingPermissionsActions,
  resetMissingPermissionsStoreForTests,
  selectMissingPermissionsSurface,
  useMissingPermissionsStore,
} from "@web/auth/providers/missing-permissions.store";
import {
  GOOGLE_SIGNUP_SCOPES_RECOVERY_RETRY_LABEL,
  GOOGLE_SIGNUP_SCOPES_RECOVERY_TITLE,
} from "@web/auth/providers/provider-copy.util";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const recoveryModuleUrl = new URL(
  `./GoogleOAuthSignupScopesRecovery.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { GoogleOAuthSignupScopesRecovery } = (await import(
  recoveryModuleUrl.href
)) as typeof import("./GoogleOAuthSignupScopesRecovery");

describe("GoogleOAuthSignupScopesRecovery", () => {
  const startGoogleAuthorization = mock();
  let lastOptions: Record<string, unknown> | undefined;

  beforeEach(() => {
    startGoogleAuthorization.mockClear();
    lastOptions = undefined;
    registerUseStartProviderAuthorizationForTests((provider, options) => ({
      loading: false,
      startAuthorization: () => {
        if (provider === "google") {
          lastOptions = options as Record<string, unknown>;
        }
        startGoogleAuthorization();
      },
    }));
    resetMissingPermissionsStoreForTests();
  });

  afterEach(() => {
    cleanup();
    resetUseStartProviderAuthorizationForTests();
    resetMissingPermissionsStoreForTests();
  });

  afterAll(() => {
    resetMissingPermissionsStoreForTests();
  });

  it("renders nothing when signup recovery is not active", () => {
    render(<GoogleOAuthSignupScopesRecovery />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requests only missing scopes with incremental auth on Try again", async () => {
    const user = userEvent.setup();
    missingPermissionsActions.openGoogleSignupRecovery([
      GOOGLE_SCOPE_CALENDAR_EVENTS,
    ]);
    render(<GoogleOAuthSignupScopesRecovery />);

    expect(
      screen.getByRole("dialog", { name: GOOGLE_SIGNUP_SCOPES_RECOVERY_TITLE }),
    ).toBeInTheDocument();
    expect(
      withinButton(GOOGLE_SIGNUP_SCOPES_RECOVERY_RETRY_LABEL).getByText(
        "Enter",
      ),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", {
        name: GOOGLE_SIGNUP_SCOPES_RECOVERY_RETRY_LABEL,
      }),
    );

    expect(startGoogleAuthorization).toHaveBeenCalledTimes(1);
    expect(lastOptions).toMatchObject({
      signupFlow: true,
      prompt: "consent",
      includeGrantedScopes: true,
      scopes: [GOOGLE_SCOPE_CALENDAR_EVENTS],
    });
    expect(
      selectMissingPermissionsSurface(useMissingPermissionsStore.getState()),
    ).toBeNull();
  });

  it("activates Try again when Enter is pressed", async () => {
    const user = userEvent.setup();
    missingPermissionsActions.openGoogleSignupRecovery([
      GOOGLE_SCOPE_CALENDAR_EVENTS,
    ]);
    render(<GoogleOAuthSignupScopesRecovery />);

    await user.keyboard("{Enter}");

    expect(startGoogleAuthorization).toHaveBeenCalledTimes(1);
  });
});

function withinButton(name: string) {
  return within(screen.getByRole("button", { name }));
}
