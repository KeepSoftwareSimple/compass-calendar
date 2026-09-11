import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { type GoogleUiState } from "@web/auth/providers/connect.types";
import { connectionProviderKind } from "@web/auth/providers/connection-provider.util";
import { accountKey } from "@web/calendars/calendar.util";
import { toggleAccountCollapsed } from "@web/calendars/collapsed-accounts.store";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const EMAIL = "ahab@pequod.com";
// Unique emails omit the provider mark, so the collapse toggle's
// accessible name is just the email. Shared-email accounts keep the
// mark (hidden until hover) and therefore include the provider.

const actualUseConnectProvider = (
  await import("@web/auth/providers/useConnectProvider")
).useConnectProvider;
let isConnectProviderMocked = true;
let googleState: GoogleUiState = "HEALTHY";
const onSelect = mock();
const commandActionFor = (state: GoogleUiState, provider = "google") =>
  state === "RECONNECT_REQUIRED"
    ? {
        label: `Reconnect ${provider === "google" ? "Google" : "Microsoft"} Calendar`,
        onSelect,
      }
    : null;
mock.module("@web/auth/providers/useConnectProvider", () => ({
  useConnectProvider: (
    kind: "google" | "microsoft" | "apple",
    ...args: Parameters<typeof actualUseConnectProvider> extends [
      infer _K,
      ...infer Rest,
    ]
      ? Rest
      : never
  ) =>
    isConnectProviderMocked
      ? {
          commandAction: commandActionFor(googleState, kind),
          connect: mock(),
          refresh: mock(),
          isAvailable: true,
          isConnecting: false,
          isRefreshing: false,
          state: googleState,
        }
      : actualUseConnectProvider(kind, ...args),
}));

afterAll(() => {
  isConnectProviderMocked = false;
});

const headerModuleUrl = new URL(
  `./AccountSectionHeader.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { AccountSectionHeader } = (await import(
  headerModuleUrl.href
)) as typeof import("./AccountSectionHeader");

const renderHeader = (
  overrides: Partial<SyncConnectionSummary> = {},
  showProviderOnHover = false,
): void => {
  const { wrapper } = createStoreWrapper();
  const connection = createMockConnection(EMAIL, overrides);
  const provider = connectionProviderKind(connection);
  render(
    <AccountSectionHeader
      account={{ provider, accountEmail: EMAIL }}
      connection={connection}
      showProviderOnHover={showProviderOnHover}
    />,
    { wrapper },
  );
};

describe("AccountSectionHeader", () => {
  beforeEach(() => {
    googleState = "HEALTHY";
    onSelect.mockClear();
  });

  it("expands by default, and toggles aria-expanded on click", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader();

    const toggle = screen.getByRole("button", { name: EMAIL });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("starts collapsed when the account's key is already in the collapsed store", () => {
    toggleAccountCollapsed(
      accountKey({ provider: "google", accountEmail: EMAIL }),
    );

    renderHeader();

    expect(screen.getByRole("button", { name: EMAIL })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("keeps collapse state per provider, not per email", () => {
    // The same address connected on Microsoft was collapsed; the Google
    // account with that address must still start expanded.
    toggleAccountCollapsed(
      accountKey({ provider: "microsoft", accountEmail: EMAIL }),
    );

    renderHeader();

    expect(screen.getByRole("button", { name: EMAIL })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("omits the provider mark when the email is unique across providers", () => {
    renderHeader();

    expect(
      screen.queryByRole("img", { name: "Google" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: EMAIL })).toBeInTheDocument();
  });

  it("reveals the provider mark on hover when the same email is on another provider", () => {
    renderHeader({}, true);

    const mark = screen.getByRole("img", { name: "Google" });
    expect(mark.parentElement).toHaveClass("opacity-0");
    expect(mark.parentElement).toHaveClass("group-hover:opacity-100");
    expect(mark.parentElement).toHaveClass("group-focus-visible:opacity-100");
    expect(
      screen.getByRole("button", { name: `${EMAIL} Google` }),
    ).toBeInTheDocument();
  });

  it("marks a Microsoft connection as Microsoft when the email is shared", () => {
    renderHeader({ provider: "microsoft" }, true);

    expect(screen.getByRole("img", { name: "Microsoft" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${EMAIL} Microsoft` }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("stays quiet - no status line, no action - while the account is healthy", () => {
    renderHeader();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toHaveClass("text-text-muted");
    expect(screen.getByText(EMAIL)).not.toHaveClass("c-sync-text-wave");
    expect(
      screen.queryByRole("button", { name: /Reconnect|Refresh|Connect/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a reconnect action scoped to the account with an error", async () => {
    const user = userEvent.setup({ delay: null });
    googleState = "RECONNECT_REQUIRED";

    renderHeader({
      state: "actionRequired",
      stateReason: "authorizationRevoked",
      connectionState: "RECONNECT_REQUIRED",
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: `Reconnect Google Calendar for ${EMAIL}`,
      }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows Microsoft reconnect copy for a Microsoft connection", async () => {
    const user = userEvent.setup({ delay: null });
    googleState = "RECONNECT_REQUIRED";

    renderHeader({
      provider: "microsoft",
      state: "actionRequired",
      stateReason: "authorizationRevoked",
      connectionState: "RECONNECT_REQUIRED",
    });

    await user.click(
      screen.getByRole("button", {
        name: `Reconnect Microsoft Calendar for ${EMAIL}`,
      }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows the shimmer on the email while the account's first import runs", () => {
    googleState = "IMPORTING";

    renderHeader({
      state: "importing",
      lastHealthyAt: null,
      connectionState: "IMPORTING",
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(EMAIL)).toHaveClass("c-sync-text-wave");
  });
});
