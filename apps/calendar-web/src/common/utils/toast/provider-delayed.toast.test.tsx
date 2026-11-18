import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor, within } from "@testing-library/react";
import { type ReactElement } from "react";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realConnectGoogle from "@web/auth/providers/useConnectProvider";
import {
  resetBillingGateAttentionForTests,
  setBillingGateOwnsScreen,
} from "@web/billing/billing-gate-attention";
import {
  deferProviderDelayedToastIfVisible,
  flushDeferredProviderDelayedToast,
  ProviderDelayedToast,
  showProviderDelayedToast,
} from "@web/common/utils/toast/provider-delayed.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { CalendarConnectionBanner } from "@web/components/CalendarConnectionBanner/CalendarConnectionBanner";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockRefresh = mock();

const microsoftProviderErrors: SyncConnectionSummary = {
  id: "conn-ms",
  provider: "microsoft",
  state: "delayed",
  stateReason: "providerErrors",
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: "a@example.com",
  connectionState: "ATTENTION",
  canSuggestContacts: false,
};

mockModuleForFile("@web/auth/providers/useConnectProvider", realConnectGoogle, {
  useConnectGoogle: () => ({ refresh: mockRefresh }),
});

describe("ProviderDelayedToast", () => {
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
        <ProviderDelayedToast toastId="google-delayed" />
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

  it("names the calendar product from the connection", () => {
    render(
      <HotkeysProvider>
        <ProviderDelayedToast
          connection={microsoftProviderErrors}
          toastId="google-delayed"
        />
      </HotkeysProvider>,
    );

    expect(
      screen.getByText("Microsoft Calendar updates are delayed"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Microsoft Calendar is slow to respond. Compass will keep trying.",
      ),
    ).toBeTruthy();
  });

  it("does not refresh with S, which other toasts use for Sign up / Sign in", () => {
    render(
      <HotkeysProvider>
        <ProviderDelayedToast toastId="google-delayed" />
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
        <ProviderDelayedToast toastId="google-delayed" />
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

describe("showProviderDelayedToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.error.mockClear();
    mocks.isActive.mockReturnValue(false);
    registerToastPort(port);
    resetBillingGateAttentionForTests();
  });

  afterEach(() => {
    resetBillingGateAttentionForTests();
  });

  it("does not show while the billing gate owns the screen", () => {
    setBillingGateOwnsScreen(true);
    showProviderDelayedToast();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  const shownConnection = () => {
    const [content] = mocks.error.mock.calls.at(-1) ?? [];
    return (content as ReactElement<{ connection: SyncConnectionSummary }>)
      .props.connection;
  };

  it("replays a toast deferred by the billing gate with its connection", async () => {
    setBillingGateOwnsScreen(true);
    showProviderDelayedToast(microsoftProviderErrors);
    expect(mocks.error).not.toHaveBeenCalled();

    setBillingGateOwnsScreen(false);

    await waitFor(() => {
      expect(shownConnection()).toEqual(microsoftProviderErrors);
    });
  });

  it("replays a visible toast hidden by the billing gate with its connection", () => {
    showProviderDelayedToast(microsoftProviderErrors);
    mocks.error.mockClear();
    mocks.isActive.mockReturnValue(true);
    deferProviderDelayedToastIfVisible();
    mocks.isActive.mockReturnValue(false);

    flushDeferredProviderDelayedToast();

    expect(shownConnection()).toEqual(microsoftProviderErrors);
  });
});
