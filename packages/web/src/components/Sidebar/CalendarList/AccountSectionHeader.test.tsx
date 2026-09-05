import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { type GoogleUiState } from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.types";
import { RECONNECT_CALENDAR_LABEL } from "@web/auth/providers/provider-copy.util";
import { toggleAccountCollapsed } from "@web/calendars/collapsed-accounts.store";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const EMAIL = "ahab@pequod.com";

// mock.module is process-wide and not reliably restorable, so - as in
// CalendarList.test.tsx - the real hook is captured up front and a flag
// (flipped in afterAll) decides which one runs, leaving later files with the
// real hook. Without a mock here this file would instead inherit whichever
// other file's useConnectGoogle mock loaded last.
const actualUseConnectProvider = (
  await import("@web/auth/providers/useConnectProvider")
).useConnectProvider;
let isConnectGoogleMocked = true;
let googleState: GoogleUiState = "HEALTHY";
const onSelect = mock();
const commandActionFor = (
  state: GoogleUiState,
  kind: "google" | "microsoft" | "apple" = "google",
) =>
  state === "RECONNECT_REQUIRED"
    ? {
        label:
          kind === "google"
            ? "Reconnect Google Calendar"
            : RECONNECT_CALENDAR_LABEL[kind],
        onSelect,
      }
    : null;
mock.module("@web/auth/providers/useConnectProvider", () => ({
  useConnectProvider: (...args: Parameters<typeof actualUseConnectProvider>) =>
    isConnectGoogleMocked
      ? {
          commandAction: commandActionFor(googleState, args[0]),
          connect: mock(),
          refresh: mock(),
          isAvailable: true,
          isConnecting: false,
          isRefreshing: false,
          state: googleState,
        }
      : actualUseConnectProvider(...args),
}));

afterAll(() => {
  isConnectGoogleMocked = false;
});

const headerModuleUrl = new URL(
  `./AccountSectionHeader.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { AccountSectionHeader } = (await import(
  headerModuleUrl.href
)) as typeof import("./AccountSectionHeader");

const renderHeader = (
  overrides: Partial<GoogleSyncConnectionSummary> = {},
): void => {
  const { wrapper } = createStoreWrapper();
  render(
    <AccountSectionHeader
      accountEmail={EMAIL}
      connection={createMockConnection(EMAIL, overrides)}
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
    toggleAccountCollapsed(EMAIL);

    renderHeader();

    expect(screen.getByRole("button", { name: EMAIL })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
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

    // The status text itself now lives in the pinned SidebarStatusBar, not
    // inline here - see SidebarStatusBar.test.tsx.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    // Named per account, so two broken accounts give a screen reader two
    // distinguishable buttons.
    await user.click(
      screen.getByRole("button", {
        name: `Reconnect Google Calendar for ${EMAIL}`,
      }),
    );
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("names a Microsoft reconnect action with Outlook copy", async () => {
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
        name: `${RECONNECT_CALENDAR_LABEL.microsoft} for ${EMAIL}`,
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
