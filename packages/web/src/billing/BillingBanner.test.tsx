import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { BillingBanner } from "@web/billing/BillingBanner";
import { BillingPastDueBanner } from "@web/billing/BillingPastDueBanner";
import { BillingReadOnlyBanner } from "@web/billing/BillingReadOnlyBanner";
import {
  billingPreviewActions,
  initialBillingPreviewState,
  useBillingPreviewStore,
} from "@web/billing/billing-preview.store";
import {
  initialCardUpdateState,
  useCardUpdateStore,
} from "@web/billing/card-update.store";
import {
  initialCheckoutPanelState,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import {
  initialSettingsState,
  selectIsSettingsOpen,
  selectSettingsPage,
  useSettingsStore,
} from "@web/settings/settings.store";
import { START_TRIAL_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";

afterEach(() => {
  cleanup();
  eventJumpActions.reset();
  useBillingPreviewStore.setState(initialBillingPreviewState, true);
  useCheckoutPanelStore.setState(initialCheckoutPanelState, true);
  useCardUpdateStore.setState(initialCardUpdateState, true);
  useSettingsStore.setState(initialSettingsState, true);
});

const renderBanner = (onCta = mock(), disabled = false) =>
  render(
    <HotkeysProvider>
      <BillingBanner
        ctaLabel="Start your free 7-day trial to save changes"
        disabled={disabled}
        message="You're looking around in read-only mode."
        onCta={onCta}
        shortcutKey={START_TRIAL_SHORTCUT_KEY}
      />
    </HotkeysProvider>,
  );

describe("BillingBanner", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    eventJumpActions.reset();
  });

  it("shows an S keycap and starts the trial when S is pressed", () => {
    const onCta = mock();
    renderBanner(onCta);

    const button = screen.getByRole("button", {
      name: "Start your free 7-day trial to save changes",
    });
    expect(within(button).getByText("S")).toBeTruthy();

    pressKey("S");

    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it("does not start the trial with S while disabled", () => {
    const onCta = mock();
    renderBanner(onCta, true);
    pressKey("S");
    expect(onCta).not.toHaveBeenCalled();
  });

  it("does not start the trial with S while event jump is active", () => {
    const onCta = mock();
    eventJumpActions.setActive(true);
    renderBanner(onCta);
    pressKey("S");
    expect(onCta).not.toHaveBeenCalled();
  });

  it("still runs the CTA from a click in tests", async () => {
    const onCta = mock();
    const user = userEvent.setup();
    renderBanner(onCta);

    await user.click(
      screen.getByRole("button", {
        name: "Start your free 7-day trial to save changes",
      }),
    );
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it("exits the preview and opens checkout from Start trial", () => {
    billingPreviewActions.enter();
    render(
      <HotkeysProvider>
        <BillingReadOnlyBanner />
      </HotkeysProvider>,
    );

    pressKey("S");

    expect(useBillingPreviewStore.getState().isPreviewing).toBe(false);
    expect(useCheckoutPanelStore.getState().isOpen).toBe(true);
  });

  it("opens Settings on Billing with the card form already open", async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <HotkeysProvider>
        <BillingPastDueBanner />
      </HotkeysProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Update card" }));

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(useCardUpdateStore.getState().isOpen).toBe(true);
  });
});
