import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import {
  resetBillingGateAttentionForTests,
  setBillingGateOwnsScreen,
} from "@web/billing/billing-gate-attention";
import {
  billingPreviewActions,
  initialBillingPreviewState,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  GoogleDelayedToast,
  showGoogleDelayedToast,
} from "@web/common/utils/toast/google-delayed.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { CalendarConnectionBanner } from "@web/components/CalendarConnectionBanner/CalendarConnectionBanner";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockRefresh = mock();

mockModuleForFile(
  "@web/auth/providers/useConnectProvider",
  realConnectProvider,
  { useConnectProvider: () => ({ refresh: mockRefresh }) },
);

describe("GoogleDelayedToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    mockRefresh.mockClear();
    mocks.dismiss.mockClear();
    registerToastPort(port);
  });

  it("shows a G keycap and refreshes when G is pressed", () => {
    render(
      <HotkeysProvider>
        <GoogleDelayedToast toastId="google-delayed" />
      </HotkeysProvider>,
    );

    expect(
      within(
        screen.getByRole("button", { name: "Refresh calendar" }),
      ).getByText("G"),
    ).toBeTruthy();
    expect(screen.getByText("Press Esc to dismiss")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();

    pressKey("G");

    expect(mocks.dismiss).toHaveBeenCalledWith("google-delayed");
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh with S, which other toasts use for Sign up / Sign in", () => {
    render(
      <HotkeysProvider>
        <GoogleDelayedToast toastId="google-delayed" />
      </HotkeysProvider>,
    );

    pressKey("S");

    expect(mocks.dismiss).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("shares G with the delayed banner so Refresh is one shortcut", () => {
    const onBannerRefresh = mock();
    render(
      <HotkeysProvider>
        <CalendarConnectionBanner kind="delayed" onAction={onBannerRefresh} />
        <GoogleDelayedToast toastId="google-delayed" />
      </HotkeysProvider>,
    );

    expect(
      within(screen.getByRole("button", { name: /^Refresh$/ })).getByText("G"),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("button", { name: "Refresh calendar" }),
      ).getByText("G"),
    ).toBeTruthy();

    pressKey("S");
    expect(onBannerRefresh).not.toHaveBeenCalled();
    expect(mockRefresh).not.toHaveBeenCalled();

    pressKey("G");
    expect(onBannerRefresh).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
    expect(mocks.dismiss).toHaveBeenCalledWith("google-delayed");
  });
});

describe("showGoogleDelayedToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.error.mockClear();
    mocks.isActive.mockReturnValue(false);
    registerToastPort(port);
    resetBillingGateAttentionForTests();
    useBillingPreviewStore.setState(initialBillingPreviewState);
  });

  afterEach(() => {
    resetBillingGateAttentionForTests();
    useBillingPreviewStore.setState(initialBillingPreviewState);
  });

  it("does not show while the billing gate owns the screen", () => {
    setBillingGateOwnsScreen(true);
    showGoogleDelayedToast();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("shows the deferred toast after Look around first", () => {
    setBillingGateOwnsScreen(true);
    showGoogleDelayedToast();
    expect(mocks.error).not.toHaveBeenCalled();

    billingPreviewActions.enter();

    expect(mocks.error).toHaveBeenCalledTimes(1);
  });
});
