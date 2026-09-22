import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "@web/__tests__/render-with-store";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { resetContactsNudgeSessionForTests } from "./contact-nudge.gate";
import { EnableContactSuggestionsNudge } from "./EnableContactSuggestionsNudge";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

// WP-06: the "occasional, non-nagging" affordance (product decision 1).
// Frequency is pinned here at the component level too: one mount per session
// shows it, the next stays empty, and dismissal survives a new session.
//
// The web suite runs in ONE process and earlier files (Sidebar/CalendarList)
// register process-wide mock.module stubs for useConnectGoogle — some without
// a `connect` at all — so this file cannot reach the real hook -> AuthApi
// path reliably. It follows the repo's delegating-mock pattern instead and
// asserts the nudge's contract AT THE HOOK BOUNDARY: it asks for the
// contacts feature and starts the flow on click. The features -> begin-body
// wire threading is covered by useConnectGoogle.scope.test.tsx, which runs
// before any module mock exists.
const actualUseConnectGoogle = (
  await import("@web/auth/providers/useConnectProvider")
).useConnectGoogle;
let isConnectGoogleMocked = true;
const connectMock = mock();
const mockUseConnectGoogle = mock(
  (_options?: Parameters<typeof actualUseConnectGoogle>[0]) => ({
    commandAction: null,
    connect: connectMock,
    connection: null,
    refresh: mock(),
    isAvailable: true,
    isConnecting: false,
    isRefreshing: false,
    state: "HEALTHY" as const,
  }),
);
mock.module("@web/auth/providers/useConnectProvider", () => ({
  useConnectGoogle: (
    ...args: Parameters<typeof actualUseConnectGoogle>
  ): ReturnType<typeof actualUseConnectGoogle> =>
    isConnectGoogleMocked
      ? (mockUseConnectGoogle(...args) as unknown as ReturnType<
          typeof actualUseConnectGoogle
        >)
      : actualUseConnectGoogle(...args),
}));

afterAll(() => {
  // Hand later files the real hook — mock.module itself is process-wide.
  isConnectGoogleMocked = false;
});

const seedHealthyConnection = () => {
  userMetadataActions.set({
    connections: [
      createMockConnection("a@example.com", {
        provider: "google",
        canSuggestContacts: false,
      }),
    ],
  });
};

describe("EnableContactSuggestionsNudge", () => {
  beforeEach(() => {
    localStorage.clear();
    resetContactsNudgeSessionForTests();
    seedHealthyConnection();
    mockUseConnectGoogle.mockClear();
    connectMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    userMetadataActions.clear();
  });

  it("shows once per session: the first mount renders, the second stays empty", () => {
    renderWithStore(<EnableContactSuggestionsNudge />);
    expect(
      screen.getByRole("button", { name: "Enable contact suggestions" }),
    ).toBeInTheDocument();
    // Inline affordance only — never a modal.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();

    // Next menu open in the SAME session: nudge-free.
    renderWithStore(<EnableContactSuggestionsNudge />);
    expect(
      screen.queryByRole("button", { name: "Enable contact suggestions" }),
    ).not.toBeInTheDocument();
  });

  it("dismissal hides it now and persists to localStorage for future sessions", async () => {
    const user = userEvent.setup();
    renderWithStore(<EnableContactSuggestionsNudge />);

    await user.click(
      screen.getByRole("button", { name: "Dismiss contact suggestions tip" }),
    );

    expect(
      screen.queryByRole("button", { name: "Enable contact suggestions" }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("compass.contactsNudge.dismissed")).toBe(
      "true",
    );

    // A NEW session (fresh session flag) still honors the dismissal.
    cleanup();
    resetContactsNudgeSessionForTests();
    renderWithStore(<EnableContactSuggestionsNudge />);
    expect(
      screen.queryByRole("button", { name: "Enable contact suggestions" }),
    ).not.toBeInTheDocument();
  });

  it("asks the connect flow for the contacts feature and starts it on click", async () => {
    const user = userEvent.setup();
    renderWithStore(<EnableContactSuggestionsNudge />);

    // The nudge's whole purpose: incremental re-consent WITH contacts.
    expect(mockUseConnectGoogle).toHaveBeenCalled();
    expect(mockUseConnectGoogle.mock.calls[0]?.[0]).toEqual({
      features: ["contacts"],
    });

    await user.click(
      screen.getByRole("button", { name: "Enable contact suggestions" }),
    );
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
