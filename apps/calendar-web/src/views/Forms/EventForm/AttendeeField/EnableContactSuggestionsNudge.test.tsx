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

// The no-match prompt: names the account that lacks contacts and pins consent
// to it. Frequency is pinned here at the component level too: one mount per
// session shows it, the next stays empty, and dismissal survives a new
// session.
//
// The web suite runs in ONE process and other files register process-wide
// mock.module stubs for this module, so this file cannot reach the real hook
// -> AuthApi path reliably. It follows the repo's delegating-mock pattern and
// asserts the contract AT THE HOOK BOUNDARY: which provider and account, the
// contacts feature, and starting the flow on click. Pinning the account into
// the begin body is covered by useConnectProvider.scope.test.tsx.
const actual = await import("@web/auth/providers/useConnectProvider");
// Not named use*: the delegate below is a plain pass-through, not a hook site.
const actualConnectProvider = actual.useConnectProvider;
let isConnectMocked = true;
const connectMock = mock();
const mockUseConnectProvider = mock(
  (
    _kind: Parameters<typeof actual.useConnectProvider>[0],
    _options?: Parameters<typeof actual.useConnectProvider>[1],
  ) => ({
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
  useConnectGoogle: actual.useConnectGoogle,
  useConnectProvider: (
    ...args: Parameters<typeof actual.useConnectProvider>
  ): ReturnType<typeof actual.useConnectProvider> =>
    isConnectMocked
      ? (mockUseConnectProvider(...args) as unknown as ReturnType<
          typeof actual.useConnectProvider
        >)
      : actualConnectProvider(...args),
}));

afterAll(() => {
  // Hand later files the real hook; mock.module itself is process-wide.
  isConnectMocked = false;
});

const connection = createMockConnection("b@example.com", {
  provider: "microsoft",
  canSuggestContacts: false,
});
const PROMPT = "Turn on contacts for b@example.com";

describe("EnableContactSuggestionsNudge", () => {
  beforeEach(() => {
    localStorage.clear();
    resetContactsNudgeSessionForTests();
    userMetadataActions.set({ connections: [connection] });
    mockUseConnectProvider.mockClear();
    connectMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    userMetadataActions.clear();
  });

  it("shows once per session: the first mount renders, the second stays empty", () => {
    renderWithStore(<EnableContactSuggestionsNudge connection={connection} />);
    expect(screen.getByText(/Missing someone\?/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PROMPT })).toBeInTheDocument();
    // Inline affordance only, never a modal.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();

    // Next showing in the SAME session: prompt-free.
    renderWithStore(<EnableContactSuggestionsNudge connection={connection} />);
    expect(
      screen.queryByRole("button", { name: PROMPT }),
    ).not.toBeInTheDocument();
  });

  it("dismissal hides it now and persists to localStorage for future sessions", async () => {
    const user = userEvent.setup();
    renderWithStore(<EnableContactSuggestionsNudge connection={connection} />);

    await user.click(
      screen.getByRole("button", { name: "Dismiss contact suggestions tip" }),
    );

    expect(
      screen.queryByRole("button", { name: PROMPT }),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem("compass.contactsNudge.dismissed")).toBe(
      "true",
    );

    // A NEW session (fresh session flag) still honors the dismissal.
    cleanup();
    resetContactsNudgeSessionForTests();
    renderWithStore(<EnableContactSuggestionsNudge connection={connection} />);
    expect(
      screen.queryByRole("button", { name: PROMPT }),
    ).not.toBeInTheDocument();
  });

  it("asks for contacts on that exact account and starts it on click", async () => {
    const user = userEvent.setup();
    renderWithStore(<EnableContactSuggestionsNudge connection={connection} />);

    expect(mockUseConnectProvider.mock.calls[0]).toEqual([
      "microsoft",
      { connection, features: ["contacts"] },
    ]);

    await user.click(screen.getByRole("button", { name: PROMPT }));
    expect(connectMock).toHaveBeenCalledTimes(1);
  });
});
