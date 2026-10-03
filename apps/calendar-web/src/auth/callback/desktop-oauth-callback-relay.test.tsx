import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  relayDesktopOAuthCallback,
  shouldRelayDesktopConnectRedirect,
  shouldRelayDesktopOAuthCallback,
} from "@web/auth/callback/desktop-oauth-callback-relay";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockOpenDesktopOAuthRelay = mock((_url: string) => {});

mock.module("@web/auth/callback/desktop-oauth-callback-relay", () => {
  const actual =
    require("@web/auth/callback/desktop-oauth-callback-relay") as typeof import("@web/auth/callback/desktop-oauth-callback-relay");
  return {
    ...actual,
    openDesktopOAuthRelay: (
      ...args: Parameters<typeof actual.openDesktopOAuthRelay>
    ) => mockOpenDesktopOAuthRelay(...args),
  };
});

const { DesktopOAuthCallbackRelay } =
  require("@web/auth/callback/DesktopOAuthCallbackRelay") as typeof import("@web/auth/callback/DesktopOAuthCallbackRelay");

describe("shouldRelayDesktopConnectRedirect", () => {
  it("relays in the browser when desktop=1 is present", () => {
    expect(
      shouldRelayDesktopConnectRedirect(
        "?provider=google&status=connected&desktop=1",
        false,
      ),
    ).toBe(true);
  });

  it("completes normally when desktop=1 is absent", () => {
    expect(
      shouldRelayDesktopConnectRedirect(
        "?provider=microsoft&status=accountMismatch",
        false,
      ),
    ).toBe(false);
  });

  it("does not relay inside the desktop shell", () => {
    expect(
      shouldRelayDesktopConnectRedirect(
        "?provider=google&status=connected&desktop=1",
        true,
      ),
    ).toBe(false);
  });
});

describe("shouldRelayDesktopOAuthCallback", () => {
  it("relays in the browser when the desktop marker is present", () => {
    expect(shouldRelayDesktopOAuthCallback("compass-desktop:abc", false)).toBe(
      true,
    );
  });

  it("completes normally when the marker is absent", () => {
    expect(shouldRelayDesktopOAuthCallback("plain-state", false)).toBe(false);
  });

  it("does not relay inside the desktop shell", () => {
    expect(shouldRelayDesktopOAuthCallback("compass-desktop:abc", true)).toBe(
      false,
    );
  });
});

describe("DesktopOAuthCallbackRelay", () => {
  beforeEach(() => {
    mockOpenDesktopOAuthRelay.mockClear();
  });

  it("redirects to the compass deep link and offers Open Compass", async () => {
    const user = userEvent.setup();
    const search = "?code=auth-code&state=compass-desktop%3Atest";
    const relayUrl = relayDesktopOAuthCallback("google", search);

    render(<DesktopOAuthCallbackRelay provider="google" search={search} />);

    expect(mockOpenDesktopOAuthRelay).toHaveBeenCalledWith(relayUrl);
    const button = screen.getByRole("button", { name: "Open Compass" });
    await user.click(button);
    expect(mockOpenDesktopOAuthRelay).toHaveBeenCalledTimes(2);
    expect(mockOpenDesktopOAuthRelay).toHaveBeenNthCalledWith(2, relayUrl);
  });
});
