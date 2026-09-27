import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  registerUseStartProviderAuthorizationForTests,
  resetUseStartProviderAuthorizationForTests,
} from "@web/auth/providers/authorization/useStartProviderAuthorization";
import {
  missingPermissionsActions,
  resetMissingPermissionsStoreForTests,
} from "@web/auth/providers/missing-permissions.store";
import {
  MISSING_PERMISSIONS_TITLE,
  REQUESTED_PERMISSIONS,
} from "@web/auth/providers/provider-copy.util";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const mockConnectGoogle = mock();
const mockConnectMicrosoft = mock();
const mockConnectApple = mock();

const connectByKind: Record<ProviderKind, ReturnType<typeof mock>> = {
  google: mockConnectGoogle,
  microsoft: mockConnectMicrosoft,
  apple: mockConnectApple,
};

mockModuleForFile(
  "@web/auth/providers/useConnectProvider",
  realConnectProvider,
  {
    useConnectProvider: (kind: ProviderKind) => ({
      state: "NOT_CONNECTED",
      isAvailable: true,
      isConnecting: false,
      isRefreshing: false,
      commandAction: null,
      connect: connectByKind[kind],
    }),
  },
);

const modalModuleUrl = new URL(
  `./MissingPermissionsModal.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { MissingPermissionsModal } = (await import(
  modalModuleUrl.href
)) as typeof import("./MissingPermissionsModal");

const renderModal = (options: { authenticated?: boolean } = {}) => {
  const authenticated = options.authenticated ?? true;
  return render(
    <SessionContext.Provider
      value={{ authenticated, setAuthenticated: mock() }}
    >
      <MissingPermissionsModal />
    </SessionContext.Provider>,
  );
};

describe("MissingPermissionsModal", () => {
  const startGoogleAuthorization = mock();
  const startMicrosoftAuthorization = mock();
  const startAppleAuthorization = mock();
  let lastGooglePrompt: string | undefined;

  beforeEach(() => {
    mockConnectGoogle.mockClear();
    mockConnectMicrosoft.mockClear();
    mockConnectApple.mockClear();
    startGoogleAuthorization.mockClear();
    startMicrosoftAuthorization.mockClear();
    startAppleAuthorization.mockClear();
    lastGooglePrompt = undefined;
    registerUseStartProviderAuthorizationForTests((provider, options) => {
      if (provider === "google") lastGooglePrompt = options?.prompt;
      return {
        loading: false,
        startAuthorization: {
          google: startGoogleAuthorization,
          microsoft: startMicrosoftAuthorization,
          apple: startAppleAuthorization,
        }[provider],
      };
    });
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

  it("renders nothing when no provider is missing permissions", () => {
    renderModal();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists the requested permissions for the provider", () => {
    missingPermissionsActions.open("google");
    renderModal();

    expect(
      screen.getByRole("dialog", { name: MISSING_PERMISSIONS_TITLE }),
    ).toBeInTheDocument();
    for (const permission of REQUESTED_PERMISSIONS.google) {
      expect(screen.getByText(permission.name)).toBeInTheDocument();
      expect(screen.getByText(permission.why)).toBeInTheDocument();
    }
  });

  it("starts sign-in with a forced consent prompt when anonymous", async () => {
    const user = userEvent.setup();
    missingPermissionsActions.open("google");
    renderModal({ authenticated: false });

    await user.click(
      screen.getByRole("button", { name: "Try again with Google" }),
    );

    expect(startGoogleAuthorization).toHaveBeenCalledTimes(1);
    expect(mockConnectGoogle).not.toHaveBeenCalled();
    expect(lastGooglePrompt).toBe("consent");
  });

  it("connects directly when authenticated", async () => {
    const user = userEvent.setup();
    missingPermissionsActions.open("microsoft");
    renderModal({ authenticated: true });

    await user.click(
      screen.getByRole("button", { name: "Try again with Microsoft" }),
    );

    expect(mockConnectMicrosoft).toHaveBeenCalledTimes(1);
    expect(startMicrosoftAuthorization).not.toHaveBeenCalled();
  });

  it("closes on Not now without starting a retry", async () => {
    const user = userEvent.setup();
    missingPermissionsActions.open("google");
    renderModal();

    await user.click(screen.getByRole("button", { name: "Not now" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockConnectGoogle).not.toHaveBeenCalled();
    expect(startGoogleAuthorization).not.toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    missingPermissionsActions.open("google");
    renderModal();

    expect(
      screen.getByRole("dialog", { name: MISSING_PERMISSIONS_TITLE }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
