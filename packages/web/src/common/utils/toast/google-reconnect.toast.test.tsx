import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import {
  isBillingGateOwningScreen,
  resetBillingGateAttentionForTests,
  setBillingGateOwnsScreen,
} from "@web/billing/billing-gate-attention";
import {
  billingPreviewActions,
  initialBillingPreviewState,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  checkoutCelebrationActions,
  initialCheckoutCelebrationState,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import {
  GoogleReconnectToast,
  resetGoogleReconnectToastStateForTests,
  showGoogleReconnectToast,
} from "@web/common/utils/toast/google-reconnect.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockConnect = mock();
const mockUseConnectProvider = mock(() => ({ connect: mockConnect }));

mockModuleForFile(
  "@web/auth/providers/useConnectProvider",
  realConnectProvider,
  { useConnectProvider: mockUseConnectProvider },
);

describe("GoogleReconnectToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    eventJumpActions.reset();
    mockConnect.mockClear();
    mockUseConnectProvider.mockClear();
    mocks.error.mockClear();
    mocks.dismiss.mockClear();
    mocks.isActive.mockReturnValue(false);
    registerToastPort(port);
  });

  const renderToast = (
    accountEmail?: string,
    provider?: "google" | "microsoft" | "apple",
  ) =>
    render(
      <HotkeysProvider>
        <GoogleReconnectToast
          accountEmail={accountEmail}
          connectionId="conn-1"
          provider={provider}
          toastId="google-revoked-api"
        />
      </HotkeysProvider>,
    );

  it("names the affected account when provided", () => {
    renderToast("lance@example.com");

    expect(
      screen.getByText("Google Calendar disconnected (lance@example.com)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Access for lance@example.com expired or was revoked. Your events are still safe in Google. Reconnect and Compass will re-import them.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to generic copy when no account email is known", () => {
    renderToast();

    expect(
      screen.getByText("Google Calendar disconnected"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This happens when access expires or is revoked. Your events are still safe in Google. Reconnect and Compass will re-import them.",
      ),
    ).toBeInTheDocument();
  });

  it("names a Microsoft connection with Outlook copy", () => {
    renderToast("ada@outlook.com", "microsoft");

    expect(
      screen.getByText("Outlook disconnected (ada@outlook.com)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Access for ada@outlook.com expired or was revoked. Your events are still safe in Outlook. Reconnect and Compass will re-import them.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconnect Outlook" }),
    ).toBeInTheDocument();
  });

  it("dismisses itself and starts connect() on click", () => {
    renderToast("lance@example.com");

    fireEvent.click(
      screen.getByRole("button", { name: "Reconnect Google Calendar" }),
    );

    expect(mocks.dismiss).toHaveBeenCalledWith("google-revoked-api");
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("shows a G keycap and reconnects when G is pressed", () => {
    renderToast("lance@example.com");

    expect(
      within(
        screen.getByRole("button", { name: "Reconnect Google Calendar" }),
      ).getByText("G"),
    ).toBeTruthy();
    expect(screen.getByText("Press Esc to dismiss")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();

    pressKey("G");

    expect(mocks.dismiss).toHaveBeenCalledWith("google-revoked-api");
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("leaves digit 1 for quick-time create", () => {
    renderToast();

    pressKey("1");

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("does not reconnect with G while event jump is active", () => {
    eventJumpActions.setActive(true);
    renderToast();

    pressKey("G");

    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("does not reconnect with S, which other toasts use for Sign up / Sign in", () => {
    renderToast();

    pressKey("S");

    expect(mockConnect).not.toHaveBeenCalled();
  });
});

describe("showGoogleReconnectToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.error.mockClear();
    mocks.dismiss.mockClear();
    mocks.isActive.mockReturnValue(false);
    registerToastPort(port);
    resetGoogleReconnectToastStateForTests();
    resetBillingGateAttentionForTests();
    useBillingPreviewStore.setState(initialBillingPreviewState);
    useCheckoutCelebrationStore.setState(initialCheckoutCelebrationState);
  });

  afterEach(() => {
    resetGoogleReconnectToastStateForTests();
    resetBillingGateAttentionForTests();
    useBillingPreviewStore.setState(initialBillingPreviewState);
    useCheckoutCelebrationStore.setState(initialCheckoutCelebrationState);
  });

  it("does not stack a second toast while one is already visible", () => {
    mocks.isActive.mockReturnValue(true);

    showGoogleReconnectToast({ accountEmail: "lance@example.com" });

    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("passes the affected account into the toast content", () => {
    showGoogleReconnectToast({
      accountEmail: "lance@example.com",
      connectionId: "conn-1",
    });

    expect(mocks.error).toHaveBeenCalledTimes(1);
  });

  it("does not show while the billing gate owns the screen", () => {
    setBillingGateOwnsScreen(true);

    showGoogleReconnectToast({ accountEmail: "lance@example.com" });

    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("shows the deferred toast after Look around first", () => {
    setBillingGateOwnsScreen(true);
    showGoogleReconnectToast({
      accountEmail: "lance@example.com",
      connectionId: "conn-1",
    });
    expect(mocks.error).not.toHaveBeenCalled();

    billingPreviewActions.enter();

    expect(mocks.error).toHaveBeenCalledTimes(1);
    expect(isBillingGateOwningScreen()).toBe(false);
  });

  it("does not show during checkout celebration", () => {
    checkoutCelebrationActions.celebrate();

    showGoogleReconnectToast({ accountEmail: "lance@example.com" });

    expect(mocks.error).not.toHaveBeenCalled();
  });
});
