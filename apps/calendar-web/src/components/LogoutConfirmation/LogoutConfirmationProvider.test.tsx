import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import "@testing-library/jest-dom";
import { session } from "@web/auth/compass/session/Session";
import * as authState from "@web/auth/compass/state/auth.state.util";
import * as errorToast from "@web/common/utils/toast/error-toast.util";
import * as toast from "@web/common/utils/toast/status-toast.util";
import * as settingsStore from "@web/settings/settings.store";

const clearAuthenticationState = spyOn(authState, "clearAuthenticationState");
const showStatusToast = spyOn(toast, "showStatusToast");
const showErrorToast = spyOn(errorToast, "showErrorToast");
const settingsActionsMock = {
  closeSettings: spyOn(settingsStore.settingsActions, "closeSettings"),
  closeCmdPalette: spyOn(settingsStore.settingsActions, "closeCmdPalette"),
};

const signOut = spyOn(session, "signOut").mockResolvedValue(undefined);

const mockClearAccountScopedClientState = mock();
const mockClearAccountScopedQueryCache = mock();

// mock.module is process-wide, so intercept the teardown functions only while
// this file runs (flag flipped in afterAll) - logout.teardown's own tests run
// against the real ones later in the suite.
const actualLogoutTeardown = {
  ...(await import("@web/auth/compass/session/logout.teardown")),
};
let isTeardownMocked = true;

mock.module("@web/auth/compass/session/logout.teardown", () => ({
  ...actualLogoutTeardown,
  clearAccountScopedClientState: (...args: unknown[]) =>
    isTeardownMocked
      ? mockClearAccountScopedClientState(...args)
      : actualLogoutTeardown.clearAccountScopedClientState(),
  clearAccountScopedQueryCache: (...args: unknown[]) =>
    isTeardownMocked
      ? mockClearAccountScopedQueryCache(...args)
      : actualLogoutTeardown.clearAccountScopedQueryCache(),
}));

// Other files (e.g. useLogoutCmdItems.test.ts, useLogout.test.ts) permanently
// swap useSession for a bare mock that returns undefined once their own tests
// finish, and useLogout destructures its result. Mock it here too - as
// elsewhere in this suite of files - so this file passes regardless of order.
const actualUseSession = (await import("@web/auth/compass/session/useSession"))
  .useSession;
let isSessionMocked = true;
mock.module("@web/auth/compass/session/useSession", () => ({
  useSession: (...args: Parameters<typeof actualUseSession>) =>
    isSessionMocked
      ? { authenticated: true, setAuthenticated: mock() }
      : actualUseSession(...args),
}));

afterAll(() => {
  isTeardownMocked = false;
  isSessionMocked = false;
  // bun never restores a spy on its own, and these live at module scope, so
  // without this the toast and auth-state fakes stay installed for every
  // later file in the run.
  clearAuthenticationState.mockRestore();
  showStatusToast.mockRestore();
  showErrorToast.mockRestore();
  settingsActionsMock.closeSettings.mockRestore();
  settingsActionsMock.closeCmdPalette.mockRestore();
  signOut.mockRestore();
});

const { LogoutConfirmationProvider } =
  require("./LogoutConfirmationProvider") as typeof import("./LogoutConfirmationProvider");
const { useLogoutConfirmation } =
  require("./hooks/useLogoutConfirmation") as typeof import("./hooks/useLogoutConfirmation");

function Opener() {
  const { openLogoutConfirmation } = useLogoutConfirmation();
  return (
    <button type="button" onClick={openLogoutConfirmation}>
      open
    </button>
  );
}

const confirmLogout = async () => {
  const user = userEvent.setup();
  render(
    <LogoutConfirmationProvider>
      <Opener />
    </LogoutConfirmationProvider>,
  );

  await user.click(screen.getByRole("button", { name: "open" }));
  await user.click(screen.getByRole("button", { name: "Log out" }));
};

afterEach(() => {
  signOut.mockClear();
  clearAuthenticationState.mockClear();
  mockClearAccountScopedClientState.mockClear();
  mockClearAccountScopedQueryCache.mockClear();
  showStatusToast.mockClear();
  showErrorToast.mockClear();
  Object.values(settingsActionsMock).forEach((spy) => spy.mockClear());
});

describe("LogoutConfirmationProvider", () => {
  it("covers the calendar while logout is in flight", async () => {
    let finishLogout = () => {};
    signOut.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLogout = () => resolve(undefined);
        }),
    );

    await confirmLogout();

    // Still in flight: the request has not resolved yet.
    const overlay = await screen.findByRole("status");
    expect(overlay).toHaveTextContent(/logging you out/i);
    expect(overlay).not.toHaveAttribute("aria-busy");
    expect(showStatusToast).not.toHaveBeenCalled();

    // The provider holds the overlay for a 400ms minimum, well inside
    // waitFor's default 1s budget. Do not stub global setTimeout here:
    // waitFor schedules its own timers on it, and a synchronous stub fires
    // them before waitFor has initialized them.
    finishLogout();

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(showStatusToast).toHaveBeenCalledWith(
      "logged-out",
      "You're logged out",
    );
  });

  it("closes Settings and the command palette on confirm", async () => {
    await confirmLogout();

    // Give the async handler time to settle.
    await waitFor(() => {
      expect(settingsActionsMock.closeSettings).toHaveBeenCalled();
      expect(settingsActionsMock.closeCmdPalette).toHaveBeenCalled();
    });
  });

  it("fires the success toast after the overlay unmounts", async () => {
    await confirmLogout();

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(showStatusToast).toHaveBeenCalledWith(
      "logged-out",
      "You're logged out",
    );
  });

  it("shows error toast and takes down overlay when signedOutRemotely is false", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));

    await confirmLogout();

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(showErrorToast).toHaveBeenCalledWith(
      "Logged out on this device. We couldn't reach the server to end the session everywhere.",
    );
  });

  it("raises no overlay on cancel", async () => {
    const user = userEvent.setup();
    render(
      <LogoutConfirmationProvider>
        <Opener />
      </LogoutConfirmationProvider>,
    );

    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
