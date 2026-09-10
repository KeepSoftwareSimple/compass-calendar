import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement } from "react";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  registerUseStartProviderAuthorizationForTests,
  resetUseStartProviderAuthorizationForTests,
} from "@web/auth/providers/authorization/useStartProviderAuthorization";
import * as realAvailableProviders from "@web/auth/providers/useAvailableConnectProviders";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import {
  resetProviderAvailabilityForTests,
  setProviderAvailabilityForTests,
} from "@web/auth/providers/useIsProviderAvailable";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let available: ProviderKind[] = ["google"];
let connectingKind: ProviderKind | null = null;
const mockConnectGoogle = mock();
const mockConnectMicrosoft = mock();
const mockConnectApple = mock();

mockModuleForFile(
  "@web/auth/providers/useAvailableConnectProviders",
  realAvailableProviders,
  { useAvailableConnectProviders: () => available },
);

const connectByKind: Record<ProviderKind, ReturnType<typeof mock>> = {
  google: mockConnectGoogle,
  microsoft: mockConnectMicrosoft,
  apple: mockConnectApple,
};

const labelByKind: Record<ProviderKind, string> = {
  google: "Connect Google Calendar",
  microsoft: "Connect Microsoft Calendar",
  apple: "Connect Apple Calendar",
};

mockModuleForFile(
  "@web/auth/providers/useConnectProvider",
  realConnectProvider,
  {
    useConnectProvider: (kind: ProviderKind) => ({
      state: "NOT_CONNECTED",
      isAvailable: true,
      isConnecting: connectingKind === kind,
      isRefreshing: false,
      commandAction: {
        label: labelByKind[kind],
        onSelect: connectByKind[kind],
      },
      connect: connectByKind[kind],
    }),
  },
);

const chooserModuleUrl = new URL(
  `./ConnectProviderChooser.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { ConnectProviderChooser } = (await import(
  chooserModuleUrl.href
)) as typeof import("./ConnectProviderChooser");

const renderChooser = (
  ui: ReactElement,
  options: { authenticated?: boolean } = {},
) => {
  const authenticated = options.authenticated ?? true;
  return render(
    <SessionContext.Provider
      value={{ authenticated, setAuthenticated: mock() }}
    >
      {ui}
    </SessionContext.Provider>,
  );
};

describe("ConnectProviderChooser", () => {
  beforeEach(() => {
    available = ["google"];
    connectingKind = null;
    mockConnectGoogle.mockClear();
    mockConnectMicrosoft.mockClear();
    mockConnectApple.mockClear();
  });

  afterEach(() => {
    cleanup();
    resetUseStartProviderAuthorizationForTests();
    resetProviderAvailabilityForTests();
  });

  it("renders a single Google button and no chooser menu when only Google is available", () => {
    renderChooser(
      <ConnectProviderChooser idleLabel="Connect Google Calendar" />,
    );

    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Connect the calendar you use" }),
    ).toBeNull();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens a keyboard-navigable chooser when Google and Microsoft are available", async () => {
    const user = userEvent.setup();
    available = ["google", "microsoft"];

    renderChooser(
      <ConnectProviderChooser idleLabel="Connect the calendar you use" />,
    );

    const trigger = screen.getByRole("button", {
      name: /Connect the calendar you use/,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(menu).toHaveClass("bg-surface-raised");
    expect(menu).not.toHaveClass("bg-surface-overlay");
    const googleItem = screen.getByRole("menuitem", { name: "Google" });
    const microsoftItem = screen.getByRole("menuitem", { name: "Microsoft" });
    expect(googleItem).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(microsoftItem).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(mockConnectMicrosoft).toHaveBeenCalledTimes(1);
    expect(mockConnectGoogle).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows a logo on every add-account menu item", async () => {
    const user = userEvent.setup();
    available = ["google", "microsoft", "apple"];

    renderChooser(<ConnectProviderChooser idleLabel="Add account" />);

    await user.click(screen.getByRole("button", { name: /Add account/ }));

    for (const name of ["Google", "Microsoft", "Apple"] as const) {
      const item = screen.getByRole("menuitem", { name });
      expect(item.innerHTML).toContain("<svg");
    }
  });

  it("renders branded connect pills for the prompt variant", async () => {
    const user = userEvent.setup();
    available = ["google", "microsoft", "apple"];

    renderChooser(<ConnectProviderChooser variant="prompt" />);

    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Microsoft Calendar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Apple Calendar" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Connect Microsoft Calendar" }),
    );
    expect(mockConnectMicrosoft).toHaveBeenCalledTimes(1);
    expect(mockConnectGoogle).not.toHaveBeenCalled();
    expect(mockConnectApple).not.toHaveBeenCalled();
  });

  it("relabels the connecting prompt pill and disables the others", () => {
    available = ["google", "microsoft", "apple"];
    connectingKind = "microsoft";

    renderChooser(<ConnectProviderChooser variant="prompt" />);

    const busy = screen.getByRole("button", { name: "Opening Microsoft…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Connect Google Calendar" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Connect Apple Calendar" }),
    ).toBeDisabled();
  });

  describe("when signed out", () => {
    const startGoogleAuthorization = mock();
    const startMicrosoftAuthorization = mock();
    const startAppleAuthorization = mock();

    beforeEach(() => {
      startGoogleAuthorization.mockClear();
      startMicrosoftAuthorization.mockClear();
      startAppleAuthorization.mockClear();
      registerUseStartProviderAuthorizationForTests((provider) => ({
        loading: false,
        startAuthorization: {
          google: startGoogleAuthorization,
          microsoft: startMicrosoftAuthorization,
          apple: startAppleAuthorization,
        }[provider],
      }));
      resetProviderAvailabilityForTests();
      setProviderAvailabilityForTests("google", "available");
    });

    it("keeps the Connect Google Calendar label and starts sign-in, not connect", async () => {
      const user = userEvent.setup();
      renderChooser(
        <ConnectProviderChooser idleLabel="Connect Google Calendar" />,
        { authenticated: false },
      );

      const button = screen.getByRole("button", {
        name: "Connect Google Calendar",
      });
      await user.click(button);

      expect(startGoogleAuthorization).toHaveBeenCalledTimes(1);
      expect(mockConnectGoogle).not.toHaveBeenCalled();
    });

    it("shows Opening Google… when the sign-in hook reports loading", () => {
      registerUseStartProviderAuthorizationForTests((provider) => ({
        loading: provider === "google",
        startAuthorization: {
          google: startGoogleAuthorization,
          microsoft: startMicrosoftAuthorization,
          apple: startAppleAuthorization,
        }[provider],
      }));

      renderChooser(
        <ConnectProviderChooser idleLabel="Connect Google Calendar" />,
        { authenticated: false },
      );

      const busy = screen.getByRole("button", { name: "Opening Google…" });
      expect(busy).toHaveAttribute("aria-busy", "true");
      expect(busy).toBeDisabled();
    });
  });
});
