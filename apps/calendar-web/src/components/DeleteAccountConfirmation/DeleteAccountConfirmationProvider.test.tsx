import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it, spyOn } from "bun:test";
import "@testing-library/jest-dom";
import { UserApi } from "@web/api/user.api";
import * as authState from "@web/auth/compass/state/auth.state.util";
import * as posthogBootstrap from "@web/auth/posthog/posthog.bootstrap";
import * as browserCleanup from "@web/common/utils/cleanup/browser.cleanup.util";

const deleteAccount = spyOn(UserApi, "deleteAccount").mockResolvedValue(
  {} as never,
);
const clearAllBrowserStorage = spyOn(
  browserCleanup,
  "clearAllBrowserStorage",
).mockResolvedValue();
const getLastKnownEmail = spyOn(authState, "getLastKnownEmail").mockReturnValue(
  "captain@example.com",
);
// jsdom's location is unconfigurable and its assign() only warns, so spy on
// it rather than replacing the object.
const assign = spyOn(window.location, "assign").mockImplementation(() => {});
const posthog = { reset: spyOn({ invoke: () => {} }, "invoke") };
const getPosthogClient = spyOn(
  posthogBootstrap,
  "getPosthogClient",
).mockReturnValue(posthog as never);

// These spies live at module scope so the requires below see them, and bun
// never restores a spy on its own: without this every later file in the run
// would keep the fakes (a getPosthogClient with no capture(), a stubbed
// location.assign), and fail somewhere unrelated.
afterAll(() => {
  deleteAccount.mockRestore();
  clearAllBrowserStorage.mockRestore();
  getLastKnownEmail.mockRestore();
  assign.mockRestore();
  getPosthogClient.mockRestore();
});

const { DeleteAccountConfirmationProvider } =
  require("./DeleteAccountConfirmationProvider") as typeof import("./DeleteAccountConfirmationProvider");
const { useDeleteAccountConfirmation } =
  require("./hooks/useDeleteAccountConfirmation") as typeof import("./hooks/useDeleteAccountConfirmation");
const { DELETE_ACCOUNT_PHRASE } =
  require("./DeleteAccountConfirmationDialog") as typeof import("./DeleteAccountConfirmationDialog");

function Opener() {
  const { openDeleteAccountConfirmation } = useDeleteAccountConfirmation();
  return (
    <button type="button" onClick={openDeleteAccountConfirmation}>
      open
    </button>
  );
}

const confirmDeletion = async () => {
  const user = userEvent.setup();
  render(
    <DeleteAccountConfirmationProvider>
      <Opener />
    </DeleteAccountConfirmationProvider>,
  );

  await user.click(screen.getByRole("button", { name: "open" }));
  await user.type(screen.getByRole("textbox"), DELETE_ACCOUNT_PHRASE);
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  return user;
};

// Spy setTimeout only after user-event is done. Testing Library treats a
// mocked setTimeout as fake timers and then user-event/waitFor crash.
const flushPendingDelete = async (finishDelete: () => void) => {
  const setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: TimerHandler,
  ) => {
    if (typeof callback === "function") callback();
    return 0;
  }) as typeof setTimeout);
  try {
    await act(async () => {
      finishDelete();
      for (let i = 0; i < 30; i++) {
        await Promise.resolve();
      }
    });
  } finally {
    setTimeoutSpy.mockRestore();
  }
};

afterEach(() => {
  deleteAccount.mockClear();
  clearAllBrowserStorage.mockClear();
  getLastKnownEmail.mockClear();
  assign.mockClear();
  getPosthogClient.mockClear();
  posthog.reset.mockClear();
});

describe("DeleteAccountConfirmationProvider", () => {
  it("resets the analytics identity after deleting the account", async () => {
    let finishDelete = () => {};
    deleteAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelete = () => resolve({} as never);
        }) as never,
    );

    await confirmDeletion();
    await flushPendingDelete(finishDelete);

    expect(posthog.reset).toHaveBeenCalledTimes(1);
  });

  it("resets analytics even when browser storage cleanup fails", async () => {
    clearAllBrowserStorage.mockRejectedValueOnce(
      new Error("IndexedDB blocked"),
    );
    let finishDelete = () => {};
    deleteAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelete = () => resolve({} as never);
        }) as never,
    );

    await confirmDeletion();
    await flushPendingDelete(finishDelete);

    expect(posthog.reset).toHaveBeenCalledTimes(1);
  });

  // Deleting spans a Mongo transaction and a Google grant revocation. Until
  // the working overlay covers the screen the user is looking at the calendar
  // of the account they just asked to delete, with nothing to say it's working.
  it("covers the calendar while the account is still being deleted", async () => {
    let finishDelete = () => {};
    deleteAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDelete = () => resolve({} as never);
        }) as never,
    );

    await confirmDeletion();

    const deleting = await screen.findByRole("status");
    expect(deleting).toHaveTextContent(/deleting your account/i);
    expect(deleting).not.toHaveAttribute("aria-busy");
    expect(assign).not.toHaveBeenCalled();

    await flushPendingDelete(finishDelete);

    expect(screen.getByRole("status")).toHaveTextContent(
      /so long captain@example.com/i,
    );
    expect(assign).toHaveBeenCalled();
  });

  it("keeps the user in a keyboard dialog if the account could not be deleted", async () => {
    deleteAccount.mockImplementationOnce(
      () => Promise.reject(new Error("nope")) as never,
    );
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    const user = await confirmDeletion();

    const failure = await screen.findByRole("dialog", {
      name: /couldn't delete your account/i,
    });
    expect(failure).toHaveTextContent(/your account is still here/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    await waitFor(() => {
      expect(deleteAccount).toHaveBeenCalledTimes(2);
    });

    consoleError.mockRestore();
  });

  it("lets the user dismiss a failed delete with Escape", async () => {
    deleteAccount.mockImplementationOnce(
      () => Promise.reject(new Error("nope")) as never,
    );
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    const user = await confirmDeletion();

    await screen.findByRole("dialog", {
      name: /couldn't delete your account/i,
    });
    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", {
          name: /couldn't delete your account/i,
        }),
      ).not.toBeInTheDocument();
    });
    expect(assign).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it("does not stack a retry dialog on top of session recovery", async () => {
    deleteAccount.mockImplementationOnce(
      () =>
        Promise.reject({
          config: {},
          response: { status: 401 },
        }) as never,
    );
    const consoleError = spyOn(console, "error").mockImplementation(() => {});

    await confirmDeletion();

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("dialog", {
        name: /couldn't delete your account/i,
      }),
    ).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
