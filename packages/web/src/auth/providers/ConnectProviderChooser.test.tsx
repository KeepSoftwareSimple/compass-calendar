import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realAvailableProviders from "@web/auth/providers/useAvailableConnectProviders";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

let available: ProviderKind[] = ["google"];
const mockConnectGoogle = mock();
const mockConnectMicrosoft = mock();

mockModuleForFile(
  "@web/auth/providers/useAvailableConnectProviders",
  realAvailableProviders,
  { useAvailableConnectProviders: () => available },
);

const connectByKind: Record<ProviderKind, ReturnType<typeof mock>> = {
  google: mockConnectGoogle,
  microsoft: mockConnectMicrosoft,
  apple: mock(),
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
      isConnecting: false,
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

describe("ConnectProviderChooser", () => {
  beforeEach(() => {
    available = ["google"];
    mockConnectGoogle.mockClear();
    mockConnectMicrosoft.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a single Google button and no chooser menu when only Google is available", () => {
    render(<ConnectProviderChooser idleLabel="Connect Google Calendar" />);

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

    render(<ConnectProviderChooser idleLabel="Connect the calendar you use" />);

    const trigger = screen.getByRole("button", {
      name: /Connect the calendar you use/,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toBeInTheDocument();
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
});
