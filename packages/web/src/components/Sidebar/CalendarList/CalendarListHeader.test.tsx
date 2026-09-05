import "@testing-library/jest-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realAuthStateUtil from "@web/auth/compass/state/auth.state.util";
import * as realUserHook from "@web/auth/compass/user/hooks/useUser";
import { type GoogleUiState } from "@web/auth/google/hooks/useConnectGoogle/useConnectGoogle.types";
import { setGoogleAvailabilityForTests } from "@web/auth/google/hooks/useIsGoogleAvailable/useIsGoogleAvailable";
import { CONNECT_CALENDAR_LABEL } from "@web/auth/providers/provider-copy.util";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import * as realAuthModal from "@web/components/AuthModal/hooks/useAuthModal";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockOpenModal = mock();
let mockEmail: string | undefined;
let mockGoogleState: GoogleUiState = "NOT_CONNECTED";
let mockIsAnonymousDirty = false;
const mockConnectGoogle = mock();
const googleCommandActionFor = (state: GoogleUiState) => {
  switch (state) {
    case "NOT_CONNECTED":
      return { label: "Connect Google Calendar", onSelect: mockConnectGoogle };
    case "RECONNECT_REQUIRED":
      return {
        label: "Reconnect Google Calendar",
        onSelect: mockConnectGoogle,
      };
    case "ATTENTION":
      return { label: "Refresh calendar", onSelect: mockConnectGoogle };
    default:
      return null;
  }
};
let mockIsConnecting = false;
let mockIsRefreshing = false;
const mockUseConnectProvider = mock(
  (_kind: "google" | "microsoft" | "apple") => ({
    state: mockGoogleState,
    isAvailable: true,
    isConnecting: mockIsConnecting,
    isRefreshing: mockIsRefreshing,
    connect: mockConnectGoogle,
    commandAction: googleCommandActionFor(mockGoogleState),
  }),
);

mockModuleForFile(
  "@web/auth/compass/state/auth.state.util",
  realAuthStateUtil,
  {
    shouldShowAnonymousCalendarChangeSignUpPrompt: () => mockIsAnonymousDirty,
    subscribeToAuthState: () => () => {},
  },
);

mockModuleForFile("@web/auth/compass/user/hooks/useUser", realUserHook, {
  useUser: () => ({ email: mockEmail }),
});

mockModuleForFile(
  "@web/auth/providers/useConnectProvider",
  realConnectProvider,
  { useConnectProvider: mockUseConnectProvider },
);

mockModuleForFile(
  "@web/components/AuthModal/hooks/useAuthModal",
  realAuthModal,
  { useAuthModal: () => ({ openModal: mockOpenModal }) },
);

// CalendarListHeader.tsx is already cached by the time this file runs -
// CalendarList.test.tsx (which sorts before this file) imports
// CalendarList.tsx, whose own top-level import evaluated this module and
// bound its hook imports to whatever was active at that earlier point. A plain
// require here would return that stale instance. A cache-busted URL forces a
// fresh evaluation that re-resolves the hooks against the mocks above (same
// technique as CalendarList.test.tsx).
const headerModuleUrl = new URL(
  `./CalendarListHeader.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { CalendarListHeader } = (await import(
  headerModuleUrl.href
)) as typeof import("./CalendarListHeader");

const renderHeader = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CalendarListHeader />
    </QueryClientProvider>,
  );

const seedOwnConnection = (
  connectionState: "HEALTHY" | "IMPORTING" | "ATTENTION" | "RECONNECT_REQUIRED",
) => {
  const connection = {
    id: "conn-1",
    state:
      connectionState === "RECONNECT_REQUIRED"
        ? "actionRequired"
        : connectionState === "ATTENTION"
          ? "delayed"
          : connectionState === "IMPORTING"
            ? "importing"
            : "healthy",
    stateReason:
      connectionState === "RECONNECT_REQUIRED" ? "authorizationRevoked" : null,
    lastSyncedAt: new Date().toISOString(),
    lastHealthyAt:
      connectionState === "IMPORTING" ? null : new Date().toISOString(),
    accountEmail: mockEmail ?? null,
    connectionState,
    canSuggestContacts: false,
  };
  userMetadataActions.set({
    connections: [connection],
    google: { connectionState, connections: [connection] },
  });
  return connection;
};

describe("CalendarListHeader", () => {
  beforeEach(() => {
    mockEmail = undefined;
    mockGoogleState = "NOT_CONNECTED";
    mockIsConnecting = false;
    mockIsRefreshing = false;
    mockIsAnonymousDirty = false;
    mockOpenModal.mockClear();
    mockUseConnectProvider.mockClear();
    mockConnectGoogle.mockClear();
    userMetadataActions.clear();
    setGoogleAvailabilityForTests("available");
  });

  it("shows a connect Google button when authenticated and Google is not connected", async () => {
    const user = userEvent.setup();
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "NOT_CONNECTED";

    renderHeader();

    expect(
      screen.getByRole("heading", { name: "ahab@pequod.com" }),
    ).toBeInTheDocument();
    const connectButton = screen.getByRole("button", {
      name: CONNECT_CALENDAR_LABEL.google,
    });
    await user.click(connectButton);
    expect(mockConnectGoogle).toHaveBeenCalledTimes(1);
  });

  it("stays quiet (no status line) when Google is healthy, to cut sidebar noise", async () => {
    const user = userEvent.setup();
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "HEALTHY";
    seedOwnConnection("HEALTHY");

    renderHeader();

    const email = screen.getByText("ahab@pequod.com");
    expect(email.tagName).toBe("SPAN");
    expect(email).toHaveClass("text-text-muted");
    expect(email).not.toHaveClass("c-sync-text-wave");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated/)).toBeNull();

    await user.hover(email);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the wave shimmer on the email while the first calendar import is in progress", async () => {
    const user = userEvent.setup();
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "IMPORTING";
    seedOwnConnection("IMPORTING");

    renderHeader();

    const email = screen.getByText("ahab@pequod.com");
    expect(email).toHaveClass("c-sync-text-wave");
    // The status text itself now lives in the pinned SidebarStatusBar, not
    // inline here - see SidebarStatusBar.test.tsx.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.hover(email);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows a refresh calendar button when the calendar is out of date", async () => {
    const user = userEvent.setup();
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "ATTENTION";
    seedOwnConnection("ATTENTION");

    renderHeader();

    const email = screen.getByText("ahab@pequod.com");
    expect(email.tagName).toBe("SPAN");
    expect(email).toHaveClass("text-text-muted");
    expect(email).not.toHaveClass("text-warning");

    const syncButton = screen.getByRole("button", {
      name: "Refresh calendar",
    });
    await user.click(syncButton);
    expect(mockConnectGoogle).toHaveBeenCalledTimes(1);
  });

  it("shows a reconnect Google button when reconnect is required", async () => {
    const user = userEvent.setup();
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "RECONNECT_REQUIRED";
    seedOwnConnection("RECONNECT_REQUIRED");

    renderHeader();

    const email = screen.getByText("ahab@pequod.com");
    expect(email).toHaveClass("text-text-muted");
    expect(email).not.toHaveClass("text-error");

    const reconnectButton = screen.getByRole("button", {
      name: "Reconnect Google Calendar",
    });
    expect(reconnectButton).toBeEnabled();
    expect(reconnectButton).not.toHaveAttribute("aria-busy");
    await user.click(reconnectButton);
    expect(mockConnectGoogle).toHaveBeenCalledTimes(1);
  });

  it("shows an immediate reconnecting state while Google OAuth is starting", () => {
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "RECONNECT_REQUIRED";
    mockIsConnecting = true;
    seedOwnConnection("RECONNECT_REQUIRED");

    renderHeader();

    const reconnectButton = screen.getByRole("button", {
      name: "Reconnecting…",
    });
    expect(reconnectButton).toBeDisabled();
    expect(reconnectButton).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("button", { name: "Reconnect Google Calendar" }),
    ).toBeNull();
  });

  it("shows an immediate connecting state while first-time Google OAuth is starting", () => {
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "NOT_CONNECTED";
    mockIsConnecting = true;

    renderHeader();

    const connectButton = screen.getByRole("button", {
      name: "Connecting…",
    });
    expect(connectButton).toBeDisabled();
    expect(connectButton).toHaveAttribute("aria-busy", "true");
  });

  it("shows an immediate refresh-request status while a calendar refresh starts", () => {
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "ATTENTION";
    mockIsRefreshing = true;
    seedOwnConnection("ATTENTION");

    renderHeader();

    const refreshButton = screen.getByRole("button", {
      name: "Catching up…",
    });
    expect(refreshButton).toBeDisabled();
    expect(refreshButton).toHaveAttribute("aria-busy", "true");
  });

  it("keeps an established calendar calm during reconciliation", () => {
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "HEALTHY";
    const connection = {
      id: "conn-1",
      state: "catchingUp",
      stateReason: null,
      lastSyncedAt: new Date().toISOString(),
      lastHealthyAt: new Date().toISOString(),
      accountEmail: "ahab@pequod.com",
      connectionState: "IMPORTING" as const,
      canSuggestContacts: false,
    };
    userMetadataActions.set({
      connections: [connection],
      google: {
        connectionState: "IMPORTING",
        connections: [connection],
      },
    });

    renderHeader();

    // Resolves to "healthy" (not "syncing"), so the sidebar shows nothing at
    // all rather than either status text - full detail lives in Settings.
    expect(screen.queryByText("Adding your calendar…")).toBeNull();
    expect(screen.queryByText(/Updated/)).toBeNull();
  });

  it("scopes to the connection matching the signed-in user's own email, not sync's aggregate precedence winner across every connected account", () => {
    // The 2026-08-04 bug: with two accounts connected, a broken connection
    // on the OTHER account made this header - which is keyed to the signed-in
    // user's OWN email - flash "needs reconnecting" anyway, because it was
    // reading the precedence-winning connection across ALL connections instead
    // of specifically this user's own.
    mockEmail = "ahab@pequod.com";
    mockGoogleState = "RECONNECT_REQUIRED";
    const ownConnection = {
      id: "conn-mine",
      state: "healthy",
      stateReason: null,
      lastSyncedAt: new Date().toISOString(),
      lastHealthyAt: new Date().toISOString(),
      accountEmail: "ahab@pequod.com",
      connectionState: "HEALTHY" as const,
      canSuggestContacts: false,
    };
    const otherAccountsBrokenConnection = {
      id: "conn-other",
      state: "actionRequired",
      stateReason: "authorizationRevoked",
      lastSyncedAt: null,
      lastHealthyAt: null,
      accountEmail: "starbuck@pequod.com",
      connectionState: "RECONNECT_REQUIRED" as const,
      canSuggestContacts: false,
    };
    userMetadataActions.set({
      connections: [otherAccountsBrokenConnection, ownConnection],
      google: {
        connectionState: "RECONNECT_REQUIRED",
        connections: [otherAccountsBrokenConnection, ownConnection],
      },
    });

    renderHeader();

    expect(mockUseConnectProvider).toHaveBeenCalledWith("google", {
      connection: ownConnection,
    });
  });
});
