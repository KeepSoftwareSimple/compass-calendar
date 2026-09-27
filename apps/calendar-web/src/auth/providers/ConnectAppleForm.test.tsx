import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Status } from "@core/errors/status.codes";
import { ConnectionIdSchema } from "@core/types/sync/identity.contracts";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { AuthApi } from "@web/api/auth.api";
import { createApiError } from "@web/api/util/api.util";
import { refreshUserMetadata } from "@web/auth/compass/user/util/user-metadata.util";
import { ConnectAppleForm } from "@web/auth/providers/ConnectAppleForm";
import {
  APPLE_CREDENTIAL_INVALID_MESSAGE,
  APPLE_CREDENTIAL_RATE_LIMIT_MESSAGE,
} from "@web/auth/providers/connect-apple.copy";
import {
  connectAppleActions,
  useConnectAppleStore,
} from "@web/auth/providers/connect-apple.store";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

mock.module("@web/auth/compass/user/util/user-metadata.util", () => ({
  refreshUserMetadata: mock(() => Promise.resolve()),
}));

describe("ConnectAppleForm", () => {
  beforeEach(() => {
    connectAppleActions.open();
  });

  afterEach(() => {
    connectAppleActions.close();
  });

  it("connects successfully and clears the password field", async () => {
    const user = userEvent.setup();
    const connectSpy = spyOn(
      AuthApi,
      "connectAppleCredential",
    ).mockResolvedValue({
      kind: "connected",
      connectionId: ConnectionIdSchema.parse("64b7f9c2e1a2b3c4d5e6f7a8"),
    });
    const { wrapper } = createStoreWrapper();

    render(<ConnectAppleForm />, { wrapper });

    await user.type(screen.getByLabelText("Apple ID email"), "user@icloud.com");
    await user.type(
      screen.getByLabelText("App-specific password"),
      "secret-password",
    );
    await user.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalledWith({
        username: "user@icloud.com",
        secret: "secret-password",
      });
    });
    expect(refreshUserMetadata).toHaveBeenCalledWith({ force: true });
    await waitFor(() => {
      expect(useConnectAppleStore.getState().isOpen).toBe(false);
    });

    connectSpy.mockRestore();
  });

  it("shows the backend wrong-password copy whole", async () => {
    const user = userEvent.setup();
    const connectSpy = spyOn(
      AuthApi,
      "connectAppleCredential",
    ).mockRejectedValue(
      createApiError(
        { method: "POST", url: "/auth/connections/credential" },
        {
          config: { method: "POST", url: "/auth/connections/credential" },
          data: {
            code: "INVALID_CREDENTIAL",
            message: APPLE_CREDENTIAL_INVALID_MESSAGE,
          },
          headers: new Headers(),
          status: Status.BAD_REQUEST,
          statusText: "Bad Request",
        },
      ),
    );
    const { wrapper } = createStoreWrapper();

    render(<ConnectAppleForm />, { wrapper });

    await user.type(screen.getByLabelText("Apple ID email"), "user@icloud.com");
    await user.type(
      screen.getByLabelText("App-specific password"),
      "wrong-password",
    );
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      APPLE_CREDENTIAL_INVALID_MESSAGE,
    );

    connectSpy.mockRestore();
  });

  it("shows the rate-limited copy whole", async () => {
    const user = userEvent.setup();
    const connectSpy = spyOn(
      AuthApi,
      "connectAppleCredential",
    ).mockRejectedValue(
      createApiError(
        { method: "POST", url: "/auth/connections/credential" },
        {
          config: { method: "POST", url: "/auth/connections/credential" },
          data: { message: "Too Many Requests" },
          headers: new Headers(),
          status: Status.TOO_MANY_REQUESTS,
          statusText: "Too Many Requests",
        },
      ),
    );
    const { wrapper } = createStoreWrapper();

    render(<ConnectAppleForm />, { wrapper });

    await user.type(screen.getByLabelText("Apple ID email"), "user@icloud.com");
    await user.type(
      screen.getByLabelText("App-specific password"),
      "wrong-password",
    );
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      APPLE_CREDENTIAL_RATE_LIMIT_MESSAGE,
    );

    connectSpy.mockRestore();
  });

  it("pre-fills the email on reconnect open", () => {
    connectAppleActions.open("host@icloud.com");
    const { wrapper } = createStoreWrapper();

    render(<ConnectAppleForm />, { wrapper });

    expect(screen.getByLabelText("Apple ID email")).toHaveValue(
      "host@icloud.com",
    );
  });

  it("does not keep the password in the connect store after submit", async () => {
    const user = userEvent.setup();
    const connectSpy = spyOn(
      AuthApi,
      "connectAppleCredential",
    ).mockResolvedValue({
      kind: "connected",
      connectionId: ConnectionIdSchema.parse("64b7f9c2e1a2b3c4d5e6f7a8"),
    });
    const { wrapper } = createStoreWrapper();

    render(<ConnectAppleForm />, { wrapper });

    await user.type(screen.getByLabelText("Apple ID email"), "user@icloud.com");
    await user.type(
      screen.getByLabelText("App-specific password"),
      "secret-password",
    );
    await user.click(screen.getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalled();
    });
    expect(useConnectAppleStore.getState()).toEqual({
      isOpen: false,
      initialEmail: "",
    });
    expect(screen.queryByLabelText("App-specific password")).toBeNull();

    connectSpy.mockRestore();
  });
});
